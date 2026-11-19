import { Item, BillLineItem, StoredBill } from '../types';
import { parseSpecialMeterAndQtyToBobin, isBobinItem, isMeterUnitOrDescription, isSpecialMeterDescription } from './stockHelper';

/**
 * Calculates the Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1  // deletion
          )
        );
      }
    }
  }

  return matrix[bn][an];
}

/**
 * Normalizes an item name string for fuzzy comparison.
 * Standardizes cable sizing tokens, removes redundant brackets, punctuation and extra spaces.
 */
export function normalizeItemString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/^(?:item\s*description\s*(?:\/|\&)?\s*goods|description\s*of\s*goods|item\s*description|description|goods|particulars|মালের\s*বিবরণ|পণ্যের\s*বিবরণ)[:\s-]+/i, '')
    .replace(/[()[\]{}]/g, ' ') // remove parentheses/brackets
    .replace(/[/\\_-]/g, ' ')   // replace slashes/dashes with spaces
    .replace(/\b500\s*m\s*(length)?\b/g, ' 500m ')
    .replace(/\b(mtr|meter|meters)\b/g, ' mtr ')
    .replace(/\s+/g, ' ')       // normalize multiple spaces
    .trim();
}

/**
 * Cable Mapping and Alias Translation Rules
 * Defines the canonical standard names, target rates, known trade aliases, and matching regexes.
 */
export interface CableMappingRule {
  canonicalName: string;
  targetRate: number;
  aliases: string[];
  patterns: RegExp[];
}

export const CABLE_MAPPING_RULES: CableMappingRule[] = [
  {
    // 1 X 1.0 Rm 3-w (3/0.65) -3/65 its mean 1 X 1.0 Rm BYA (Rate 3318)
    canonicalName: '1 X 1.0 Rm BYA',
    targetRate: 3318,
    aliases: [
      '1 X 1.0 Rm 3-w (3/0.65) -3/65',
      '1 X 1.0 Rm 3-w (3/.065)',
      '1 X 1.0 Rm  3-w (3/.065)',
      '1 X 1.0 Rm 3/65',
      '1 X 1.0 Rm -3/65',
      '1 X 1.0 Rm 3-w',
      '1 X 1.0 Rm (3/0.65)',
      '1 X 1.0 Rm (3/.065)',
      '1 X 1.0 Rm 3 w',
      '1.0 Rm 3-w (3/0.65) -3/65',
      '1.0 Rm 3/65',
      '1 X 1.0 Rm BYA',
      '1.0 Rm BYA',
      '1X1.0 Rm BYA'
    ],
    patterns: [
      /1\s*x?\s*1(?:\.0)?\s*rm\b.*(?:3\s*[\/.-]?\s*65|0?\.0?65|3\s*[\/.-]?\s*w)/i,
      /1\s*x?\s*1(?:\.0)?\s*rm\b.*bya/i
    ]
  },
  {
    // 1 X 1.3 Rm 3-w (3/.029) -3/22 its mean 1 X 1.3 Rm BYA (Rate 4186)
    canonicalName: '1 X 1.3 Rm BYA',
    targetRate: 4186,
    aliases: [
      '1 X 1.3 Rm 3-w (3/.029) -3/22',
      '1 X 1.3 Rm 3-w (3/0.29) -3/22',
      '1 X 1.3 Rm 3-w (3/.029)',
      '1 X 1.3 Rm 3/22',
      '1 X 1.3 Rm -3/22',
      '1 X 1.3 Rm 3-w',
      '1 X 1.3 Rm (3/.029)',
      '1 X 1.3 Rm 3 w',
      '1.3 Rm 3-w (3/.029) -3/22',
      '1.3 Rm 3/22',
      '1 X 1.3 Rm BYA',
      '1.3 Rm BYA',
      '1X1.3 Rm BYA'
    ],
    patterns: [
      /1\s*x?\s*1\.3\s*rm\b.*(?:3\s*[\/.-]?\s*22|0?\.0?29|3\s*[\/.-]?\s*w)/i,
      /1\s*x?\s*1\.3\s*rm\b.*bya/i
    ]
  },
  {
    // 1 X 2.0 Rm 3 w (3/.036) its mean 1 X 2.0 Rm BYA (Rate 6351)
    canonicalName: '1 X 2.0 Rm BYA',
    targetRate: 6351,
    aliases: [
      '1 X 2.0 Rm 3 w (3/.036)',
      '1 X 2.0 Rm 3-w (3/.036)',
      '1 X 2.0 Rm 3-w',
      '1 X 2.0 Rm 3 w',
      '1 X 2.0 Rm 3/036',
      '1 X 2.0 Rm (3/.036)',
      '1 X 2.0 Rm BYA',
      '1 X 2 Rm BYA',
      '2.0 Rm BYA',
      '1X2.0 Rm BYA'
    ],
    patterns: [
      /1\s*x?\s*2(?:\.0)?\s*rm\b.*(?:3\s*[\/.-]?\s*w|0?\.0?36)/i,
      /1\s*x?\s*2(?:\.0)?\s*rm\b.*bya/i
    ]
  },
  {
    // 1 X 3.0 Rm 7-w (7/.029) -7/22 its mean 1 X 3.0 Rm BYA (Rate 9222)
    canonicalName: '1 X 3.0 Rm BYA',
    targetRate: 9222,
    aliases: [
      '1 X 3.0 Rm 7-w (7/.029) -7/22',
      '1 X 3.0 Rm 7-w (7/0.29) -7/22',
      '1 X 3.0 Rm 7-w (7/.029)',
      '1 X 3.0 Rm 7/22',
      '1 X 3.0 Rm -7/22',
      '1 X 3.0 Rm 7-w',
      '1 X 3.0 Rm 7 w',
      '3.0 Rm 7-w (7/.029) -7/22',
      '3.0 Rm 7/22',
      '1 X 3.0 Rm BYA',
      '3.0 Rm BYA',
      '1X3.0 Rm BYA'
    ],
    patterns: [
      /1\s*x?\s*3(?:\.0)?\s*rm\b.*(?:7\s*[\/.-]?\s*22|0?\.0?29|7\s*[\/.-]?\s*w)/i,
      /1\s*x?\s*3(?:\.0)?\s*rm\b.*bya/i
    ]
  },
  {
    // 1 X 2.5 Rm 7-w or 1 X 2.5 Rm 3 w (3/.036) 3/20 its mean 1 X 2.5 Rm BYA (Rate 7658)
    canonicalName: '1 X 2.5 Rm BYA',
    targetRate: 7658,
    aliases: [
      '1 X 2.5 Rm 7-w',
      '1 X 2.5 Rm 7 w',
      '1 X 2.5 Rm 3 w (3/.036) 3/20',
      '1 X 2.5 Rm 3-w (3/.036) 3/20',
      '1 X 2.5 Rm 3/20',
      '1 X 2.5 Rm 3 w (3/.036)',
      '1 X 2.5 Rm 3-w',
      '1 X 2.5 Rm 3 w',
      '1 X 2.5 Rm BYA',
      '2.5 Rm BYA',
      '2.5 Rm 7-w',
      '1X2.5 Rm BYA'
    ],
    patterns: [
      /1\s*x?\s*2\.5\s*rm\b.*(?:7\s*[\/.-]?\s*w|3\s*[\/.-]?\s*20|0?\.0?36|3\s*[\/.-]?\s*w)/i,
      /1\s*x?\s*2\.5\s*rm\b.*bya/i
    ]
  },
  {
    // 1x1.5 Rm-BYAc/m or 1 X 1.5 Rm (7/w) its mean 1 X 1.5 Rm (7-w) BYA (Rate 4799)
    canonicalName: '1 X 1.5 Rm (7-w) BYA',
    targetRate: 4799,
    aliases: [
      '1x1.5 Rm-BYAc/m',
      '1 X 1.5 Rm-BYAc/m',
      '1 X 1.5 Rm (7/w)',
      '1 X 1.5 Rm (7-w)',
      '1 X 1.5 Rm 7-w',
      '1 X 1.5 Rm 7/w',
      '1 X 1.5 Rm (7-w) BYA',
      '1 X 1.5 Rm BYA',
      '1.5 Rm 7-w BYA',
      '1.5 Rm (7/w)',
      '1.5 Rm-BYAc/m',
      '1X1.5 Rm (7-w) BYA'
    ],
    patterns: [
      /1\s*x?\s*1\.5\s*rm\b.*(?:bya\s*c\s*[\/.]?\s*m|7\s*[\/.-]?\s*w)/i,
      /1\s*x?\s*1\.5\s*rm\b.*bya/i
    ]
  },
  {
    // 2 X 40/.0076 Flexible Cable c/m then compare price 12091 -> 1 X 2 Rm (40/76 Round )
    canonicalName: '1 X 2 Rm (40/76 Round )',
    targetRate: 12091,
    aliases: [
      '2 X 40/.0076 Flexible Cable c/m',
      '2 X 40/.0076 Flexible Cable',
      '2 X 40/0076 Flexible Cable c/m',
      '2 X 40/0076 Flexible Cable',
      '2 X 40/.0076 Flexible',
      '2 X 40/76 Round',
      '2X 40/76 Round',
      '1 X 2 Rm (40/76 Round )',
      '1 X 2 Rm (40/76 Round)',
      '40/.0076 Flexible Cable c/m',
      '40/0076 Flexible Cable'
    ],
    patterns: [
      /2\s*x\s*40[\/.\s]*0*76\b.*flexible/i,
      /40[\/.\s]*0*76\b.*flexible/i,
      /(?:2\s*x\s*40\s*\/\s*76\s*round|1\s*x\s*2\s*rm\b.*40\s*\/\s*76)/i
    ]
  },
  {
    // 2 X 14/0076 T.T map to 2 X 14/76 .19 mm (14/.0076 T/T ) its fixed (Rate 3100)
    canonicalName: '2 X 14/76 .19 mm (14/.0076 T/T )',
    targetRate: 3100,
    aliases: [
      '2 X 14/0076 T.T',
      '2 X 14/0076 T/T',
      '2 X 14/.0076 T.T',
      '2 X 14/.0076 T/T',
      '2 X 14/76 .19 mm (14/.0076 T/T )',
      '2 X 14/76 .19 mm (14/.0076 T.T )',
      '2 X 14/76 T.T',
      '2 X 14/76 T/T',
      '14/0076 T.T',
      '14/0076 T/T'
    ],
    patterns: [
      /2\s*x\s*14[\/.\s]*0*76\b.*t[\/.]?t/i,
      /14[\/.\s]*0*76\b.*t[\/.]?t/i,
      /2\s*x\s*14\s*\/\s*76.*t[\/.]?t/i
    ]
  }
];

/**
 * Resolves a text description or rate to its canonical cable rule if matched.
 */
export function matchCanonicalCableRule(
  desc: string,
  rate?: number
): CableMappingRule | null {
  const cleanDesc = (desc || '').trim().toLowerCase();
  const numRate = typeof rate === 'number' ? rate : (parseFloat(String(rate)) || 0);

  // 1. If desc matches any alias or regex pattern, that takes top priority
  if (cleanDesc && !/^\d+(?:\.\d+)?$/.test(cleanDesc)) {
    for (const rule of CABLE_MAPPING_RULES) {
      if (rule.aliases.some(a => a.toLowerCase() === cleanDesc || cleanDesc === a.toLowerCase().replace(/\s+/g, ' '))) {
        return rule;
      }
      if (rule.patterns.some(p => p.test(cleanDesc))) {
        return rule;
      }
    }
  }

  // 2. If desc is empty or purely a numeric rate string (e.g. user typed 3318), match by rate
  if (!cleanDesc || /^\d+(?:\.\d+)?$/.test(cleanDesc)) {
    if (numRate > 0) {
      const byRate = CABLE_MAPPING_RULES.find(r => Math.abs(r.targetRate - numRate) < 0.05);
      if (byRate) {
        return byRate;
      }
    }
  } else if (numRate > 0) {
    // 3. If desc is provided and rate matches a rule, ONLY match if description is compatible with the rule
    const byRate = CABLE_MAPPING_RULES.find(r => Math.abs(r.targetRate - numRate) < 0.05);
    if (byRate) {
      const nameSim = calculateItemNameSimilarity(cleanDesc, byRate.canonicalName);
      if (nameSim >= 0.65 || byRate.patterns.some(p => p.test(cleanDesc))) {
        return byRate;
      }
    }
  }

  return null;
}

/**
 * Finds the corresponding catalog Item for a given cable mapping rule.
 */
export function findCanonicalItemInCatalog(
  rule: CableMappingRule,
  catalog: Item[]
): Item | null {
  if (!rule || !Array.isArray(catalog) || catalog.length === 0) return null;

  // 1. Match by rate
  const byRate = catalog.find(i => Math.abs((i.rate || 0) - rule.targetRate) < 0.05);
  if (byRate) return byRate;

  // 2. Match by canonical name
  const byName = catalog.find(i => i.name.trim().toLowerCase() === rule.canonicalName.trim().toLowerCase());
  if (byName) return byName;

  // 3. Match by any alias
  for (const alias of rule.aliases) {
    const byAlias = catalog.find(i => i.name.trim().toLowerCase() === alias.trim().toLowerCase());
    if (byAlias) return byAlias;
  }

  return null;
}

/**
 * Finds a catalog item by exact rate (e.g. rate 3318 -> 1 X 1.0 Rm BYA).
 * "if rate 3318 then item name select 1 X 1.0 Rm BYA and same for all items."
 */
export function findItemByRate(
  rate: number,
  catalog: Item[],
  descHint?: string
): Item | null {
  if (!rate || rate <= 0 || !Array.isArray(catalog) || catalog.length === 0) return null;

  // 1. Check canonical cable rules first
  const rule = CABLE_MAPPING_RULES.find(r => Math.abs(r.targetRate - rate) < 0.05);
  if (rule) {
    const item = findCanonicalItemInCatalog(rule, catalog);
    if (item) return item;
  }

  // 2. Filter all catalog items with this rate
  const matches = catalog.filter(i => Math.abs((i.rate || 0) - rate) < 0.05);
  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1 && descHint && descHint.trim()) {
    let best = matches[0];
    let bestSim = -1;
    for (const m of matches) {
      const sim = calculateItemNameSimilarity(descHint, m.name);
      if (sim > bestSim) {
        bestSim = sim;
        best = m;
      }
    }
    return best;
  }

  return matches.length > 0 ? matches[0] : null;
}

/**
 * Returns all trade aliases for an item (used for searchable dropdowns and fuzzy matching).
 */
export function getItemAliases(item: Item): string[] {
  if (!item) return [];
  const rule = CABLE_MAPPING_RULES.find(
    r => Math.abs(r.targetRate - (item.rate || 0)) < 0.05 ||
         r.canonicalName.toLowerCase() === item.name.toLowerCase()
  );
  if (rule) {
    return rule.aliases;
  }
  return [];
}

/**
 * Gets the standard/canonical display name for an item.
 */
export function getCanonicalItemName(originalName: string, rate?: number): string {
  const rule = matchCanonicalCableRule(originalName, rate);
  if (rule) {
    return rule.canonicalName;
  }
  return originalName;
}

/**
 * Extracts alphanumeric and dimension tokens for token-level comparison.
 * e.g., "1 X 1.5 Rm BYM" -> ["1", "x", "1.5", "rm", "bym"]
 */
export function tokenizeItemString(str: string): string[] {
  const normalized = normalizeItemString(str);
  return normalized.split(/\s+/).filter(Boolean);
}

/**
 * Calculates string similarity score between 0.00 (0%) and 1.00 (100%).
 * Uses a combination of:
 * 1. Normalized Levenshtein ratio
 * 2. Token-level Dice / Jaccard similarity
 * 3. Compact alphanumeric similarity
 */
export function calculateItemNameSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = normalizeItemString(str1);
  const s2 = normalizeItemString(str2);

  if (s1 === s2) return 1.0;

  // Check canonical cable rule equality
  const r1 = matchCanonicalCableRule(str1);
  const r2 = matchCanonicalCableRule(str2);
  if (r1 && r2 && r1.canonicalName.toLowerCase() === r2.canonicalName.toLowerCase()) {
    return 1.0;
  }
  if (r1 && (r1.canonicalName.toLowerCase() === str2.trim().toLowerCase() || r1.aliases.some(a => a.toLowerCase() === str2.trim().toLowerCase()))) {
    return 1.0;
  }
  if (r2 && (r2.canonicalName.toLowerCase() === str1.trim().toLowerCase() || r2.aliases.some(a => a.toLowerCase() === str1.trim().toLowerCase()))) {
    return 1.0;
  }

  // Special handling for meter items vs 500m length special items
  const isMeter1 = /\bmtr\b|500m|bobin/i.test(s1);
  const isMeter2 = /\bmtr\b|500m|bobin/i.test(s2);
  const bothMeter = isMeter1 && isMeter2;

  // 1. Direct Levenshtein similarity on normalized text
  const maxLen = Math.max(s1.length, s2.length);
  const levDist = levenshteinDistance(s1, s2);
  const levSim = maxLen > 0 ? Math.max(0, 1 - levDist / maxLen) : 0;

  // 2. Compact string similarity (ignoring all spaces & punctuation)
  const clean1 = s1.replace(/[^a-z0-9]/g, '');
  const clean2 = s2.replace(/[^a-z0-9]/g, '');
  if (clean1 === clean2 && clean1.length > 0) {
    return 1.0;
  }
  const cleanMaxLen = Math.max(clean1.length, clean2.length);
  const cleanLevDist = levenshteinDistance(clean1, clean2);
  const cleanSim = cleanMaxLen > 0 ? Math.max(0, 1 - cleanLevDist / cleanMaxLen) : 0;

  // 3. Token-based overlap (Dice coefficient)
  const tokens1 = tokenizeItemString(s1);
  const tokens2 = tokenizeItemString(s2);

  let commonTokenCount = 0;
  const matchedTokens2 = new Set<number>();

  for (const t1 of tokens1) {
    for (let i = 0; i < tokens2.length; i++) {
      if (!matchedTokens2.has(i)) {
        const t2 = tokens2[i];
        if (
          t1 === t2 ||
          ((t1 === 'mtr' || t1 === '500m' || t1 === 'bobin') && (t2 === 'mtr' || t2 === '500m' || t2 === 'bobin')) ||
          (t1.length > 2 && t2.length > 2 && levenshteinDistance(t1, t2) <= 1)
        ) {
          commonTokenCount++;
          matchedTokens2.add(i);
          break;
        }
      }
    }
  }

  const tokenSim = (tokens1.length + tokens2.length) > 0
    ? (2 * commonTokenCount) / (tokens1.length + tokens2.length)
    : 0;

  // Token containment bonus (e.g. if one string is a subset of the other)
  const isSubset = tokens1.length > 0 && tokens1.every(t => tokens2.includes(t)) ||
                   tokens2.length > 0 && tokens2.every(t => tokens1.includes(t));
  const subsetBonus = isSubset ? 0.15 : (bothMeter ? 0.20 : 0);

  // Combined weighted score
  const combinedScore = Math.max(
    levSim,
    cleanSim,
    tokenSim * 0.7 + Math.max(levSim, cleanSim) * 0.3 + subsetBonus
  );

  return Math.min(1.0, Math.max(0, combinedScore));
}

/**
 * Checks if two rates match 100% (allowing minor float rounding <= 0.05).
 */
export function isRate100PercentMatch(importedRate: number, storedRate: number): boolean {
  if (importedRate <= 0 || storedRate <= 0) {
    return false;
  }
  return Math.abs(importedRate - storedRate) < 0.05;
}

export interface ItemMatchResult {
  importedDescription: string;
  importedRate: number;
  importedQty: number;
  importedUnit?: string;
  importedAmount: number;
  
  // Stored item match details
  matchedStoredItem: Item | null;
  similarityScore: number; // 0 to 1
  isName70PercentMatch: boolean;
  isRate100PercentMatch: boolean;
  
  // Challan without price detection
  isChallanWithoutPrice: boolean;
  suggestedStoredRate: number;
  suggestedStoredItem: Item | null;

  // Final decision
  shouldUseStoredName: boolean;
  finalItemDescription: string;
  finalItemId?: string;
  finalSizeSpec?: string;
  finalUnit?: string;
  finalRate: number;
  
  // Conflict details
  hasConflict: boolean;
  conflictReason?: 'missing_price' | 'rate_mismatch' | 'multiple_candidates' | 'partial_match_no_rate' | 'unmatched';
  conflictMessage?: string;
  alternativeCandidates?: { item: Item; similarity: number; rateMatches: boolean }[];
}

/**
 * Matches an imported item against the stored catalog items.
 * Rule:
 * If Item Name >= 70% match AND Rate == 100% match:
 *  -> Show Stored Item Name (not imported item name)
 * If there is any conflict (e.g., Name >= 70% but Rate != 100%, or ambiguous candidates):
 *  -> Flag conflict and notify user.
 * If uploaded item has NO price (rate is 0 or missing, e.g. Challan without price):
 *  -> Identify that immediately and provide auto-suggested stored item price.
 */
export function matchImportedItemWithStored(
  importedDesc: string,
  importedRate: number,
  importedQty: number,
  storedItems: Item[],
  importedUnit?: string,
  importedAmount?: number
): ItemMatchResult {
  const cleanRawDesc = (importedDesc || '').trim();
  const effectiveRate = importedRate > 0
    ? importedRate
    : (importedAmount && importedQty > 0 ? importedAmount / importedQty : 0);

  const isWithoutPrice = effectiveRate <= 0 && (!importedAmount || importedAmount <= 0);
  const isMeterDesc = isSpecialMeterDescription(cleanRawDesc) || isMeterUnitOrDescription(importedUnit);

  // 0. High priority: Canonical Cable Rule mapping (e.g. 1 X 1.0 Rm 3-w (3/0.65) -3/65 -> 1 X 1.0 Rm BYA)
  const cableRule = matchCanonicalCableRule(cleanRawDesc, effectiveRate);
  if (cableRule) {
    const matchedItem = findCanonicalItemInCatalog(cableRule, storedItems);
    if (matchedItem) {
      const finalRate = effectiveRate > 0 ? effectiveRate : (cableRule.targetRate || matchedItem.rate || 0);
      const finalQty = importedQty || 1;
      const finalAmt = importedAmount || Math.round(finalQty * finalRate);
      const finalDesc = cableRule.canonicalName;
      const rateMatches = isWithoutPrice ? false : isRate100PercentMatch(effectiveRate, matchedItem.rate || cableRule.targetRate);

      return {
        importedDescription: cleanRawDesc,
        importedRate: effectiveRate,
        importedQty: finalQty,
        importedUnit: matchedItem.unit || importedUnit || 'Coils',
        importedAmount: finalAmt,
        matchedStoredItem: matchedItem,
        similarityScore: 1.0,
        isName70PercentMatch: true,
        isRate100PercentMatch: isWithoutPrice ? false : rateMatches,
        isChallanWithoutPrice: isWithoutPrice,
        suggestedStoredRate: matchedItem.rate || cableRule.targetRate,
        suggestedStoredItem: matchedItem,
        shouldUseStoredName: true,
        finalItemDescription: finalDesc,
        finalItemId: matchedItem.id,
        finalSizeSpec: matchedItem.sizeSpec || '',
        finalUnit: matchedItem.unit || importedUnit || 'Coils',
        finalRate: finalRate,
        hasConflict: false,
        conflictReason: undefined,
        conflictMessage: undefined
      };
    }
  }

  // 0b. General Rate-Based Matching: "if rate 3318 then item name select 1 X 1.0 Rm BYA and same for all items"
  if (!isWithoutPrice && effectiveRate > 0) {
    const rateItem = findItemByRate(effectiveRate, storedItems, cleanRawDesc);
    if (rateItem) {
      const nameSim = calculateItemNameSimilarity(cleanRawDesc, rateItem.name);
      // Only trigger if name is empty, numeric, or has at least 70% similarity with the rate item
      if (!cleanRawDesc || /^\d+(?:\.\d+)?$/.test(cleanRawDesc) || nameSim >= 0.70) {
        const finalQty = importedQty || 1;
        const finalAmt = importedAmount || Math.round(finalQty * effectiveRate);
        const finalDesc = getCanonicalItemName(rateItem.name, effectiveRate);

        return {
          importedDescription: cleanRawDesc,
          importedRate: effectiveRate,
          importedQty: finalQty,
          importedUnit: rateItem.unit || importedUnit || 'Coils',
          importedAmount: finalAmt,
          matchedStoredItem: rateItem,
          similarityScore: Math.max(nameSim, 0.95),
          isName70PercentMatch: true,
          isRate100PercentMatch: true,
          isChallanWithoutPrice: false,
          suggestedStoredRate: rateItem.rate || effectiveRate,
          suggestedStoredItem: rateItem,
          shouldUseStoredName: true,
          finalItemDescription: finalDesc,
          finalItemId: rateItem.id,
          finalSizeSpec: rateItem.sizeSpec || '',
          finalUnit: rateItem.unit || importedUnit || 'Coils',
          finalRate: effectiveRate,
          hasConflict: false,
          conflictReason: undefined,
          conflictMessage: undefined
        };
      }
    }
  }

  // Compute similarities for all stored items
  const candidates = storedItems.map((item) => {
    let nameSim = calculateItemNameSimilarity(cleanRawDesc, item.name);
    // Also check item.code if provided
    let codeSim = 0;
    if (item.code) {
      codeSim = calculateItemNameSimilarity(cleanRawDesc, item.code);
    }

    // If imported desc mentions Mtr or 500m/1000m, boost special meter items
    if (isMeterDesc && item.isSpecialItem) {
      nameSim = Math.max(nameSim, 0.95);
    }

    const bestSim = Math.max(nameSim, codeSim);

    // Rate matching check - also handles special multiplier rates (e.g. 5x coil rate)
    const mult = Number(item.stockMultiplier) || (item.isSpecialItem ? 5 : 1);
    const directRateMatch = !isWithoutPrice && isRate100PercentMatch(effectiveRate, item.rate || 0);
    const multRateMatch = !isWithoutPrice && mult > 1 && (
      isRate100PercentMatch(effectiveRate * mult, item.rate || 0) ||
      (importedAmount && importedQty > 0 && Math.abs(importedAmount - ((importedQty / mult) * (item.rate || 0))) < 1)
    );
    const rateMatches = directRateMatch || multRateMatch;

    return {
      item,
      similarity: bestSim,
      rateMatches
    };
  });

  // Sort candidates by similarity descending
  candidates.sort((a, b) => b.similarity - a.similarity);

  // Filter candidates with similarity >= 0.70 (70% match)
  const highSimCandidates = candidates.filter((c) => c.similarity >= 0.70);

  // 1. Exact 100% rate + >= 70% name match (when price was provided)
  const qualifiedMatches = highSimCandidates.filter((c) => c.rateMatches);

  if (qualifiedMatches.length > 0 && !isWithoutPrice) {
    const bestMatch = qualifiedMatches[0];
    const isMultiple = qualifiedMatches.length > 1;

    // Check if there are multiple candidates with identical rate and high similarity
    const altCandidates = qualifiedMatches.slice(1);

    // If special Bobin item or meter description, convert coil/meter quantity to Bobin quantity (e.g. 1000 mtr -> 2 Bobin, 10 coils -> 2 Bobin)
    const isSpecial = bestMatch.item.isSpecialItem || isBobinItem(bestMatch.item) || isMeterDesc;
    const { parsedQty, parsedUnit } = parseSpecialMeterAndQtyToBobin(
      cleanRawDesc,
      importedQty,
      importedUnit || bestMatch.item.unit,
      isSpecial
    );

    const finalQty = parsedQty;
    const finalUnit = isSpecial ? 'Bobin' : (bestMatch.item.unit || parsedUnit || 'Coils');

    const finalRate = bestMatch.item.rate || effectiveRate;
    const finalAmount = importedAmount || Math.round(finalQty * finalRate);

    return {
      importedDescription: cleanRawDesc,
      importedRate: effectiveRate,
      importedQty: finalQty,
      importedUnit: finalUnit,
      importedAmount: finalAmount,
      matchedStoredItem: bestMatch.item,
      similarityScore: bestMatch.similarity,
      isName70PercentMatch: true,
      isRate100PercentMatch: true,
      isChallanWithoutPrice: false,
      suggestedStoredRate: bestMatch.item.rate || 0,
      suggestedStoredItem: bestMatch.item,
      shouldUseStoredName: true,
      finalItemDescription: bestMatch.item.name, // Stored item name!
      finalItemId: bestMatch.item.id,
      finalSizeSpec: bestMatch.item.sizeSpec || '',
      finalUnit: finalUnit,
      finalRate: finalRate,
      hasConflict: false, // 100% price + >=70% name match -> auto-map without asking
      conflictReason: undefined,
      conflictMessage: undefined,
      alternativeCandidates: isMultiple ? altCandidates : undefined
    };
  }

  // 2. Challan Without Price or Rate Mismatch (Name >= 70% match)
  if (highSimCandidates.length > 0) {
    const topCandidate = highSimCandidates[0];
    const storedItemRate = topCandidate.item.rate || 0;

    const isSpecial = topCandidate.item.isSpecialItem || isBobinItem(topCandidate.item) || isMeterDesc;
    const { parsedQty, parsedUnit } = parseSpecialMeterAndQtyToBobin(
      cleanRawDesc,
      importedQty,
      importedUnit || topCandidate.item.unit,
      isSpecial
    );

    const finalQty = parsedQty;
    const finalUnit = isSpecial ? 'Bobin' : (topCandidate.item.unit || parsedUnit || 'Coils');

    if (isWithoutPrice) {
      // Challan without price: Suggest catalog rate and suggest master item
      const suggestedRate = storedItemRate;
      const suggestedAmount = Math.round(finalQty * suggestedRate);

      return {
        importedDescription: cleanRawDesc,
        importedRate: 0,
        importedQty: finalQty,
        importedUnit: finalUnit,
        importedAmount: 0,
        matchedStoredItem: topCandidate.item,
        similarityScore: topCandidate.similarity,
        isName70PercentMatch: true,
        isRate100PercentMatch: false,
        isChallanWithoutPrice: true,
        suggestedStoredRate: suggestedRate,
        suggestedStoredItem: topCandidate.item,
        shouldUseStoredName: true, // Default to using standardized stored name
        finalItemDescription: topCandidate.item.name,
        finalItemId: topCandidate.item.id,
        finalSizeSpec: topCandidate.item.sizeSpec || '',
        finalUnit: finalUnit,
        finalRate: suggestedRate,
        hasConflict: true,
        conflictReason: 'missing_price',
        conflictMessage: `Challan without price: Matched catalog "${topCandidate.item.name}" (${Math.round(topCandidate.similarity * 100)}%). Stored price is ৳${suggestedRate.toFixed(2)}.`,
        alternativeCandidates: highSimCandidates
      };
    }

    const rateDiffMsg = effectiveRate > 0 && storedItemRate > 0
      ? `Imported Rate ৳${effectiveRate.toFixed(2)} ≠ Stored Rate ৳${storedItemRate.toFixed(2)}`
      : `Rate missing or mismatch (Imported: ৳${effectiveRate}, Stored: ৳${storedItemRate})`;

    return {
      importedDescription: cleanRawDesc,
      importedRate: effectiveRate,
      importedQty: finalQty,
      importedUnit: finalUnit,
      importedAmount: importedAmount || (effectiveRate * finalQty),
      matchedStoredItem: topCandidate.item,
      similarityScore: topCandidate.similarity,
      isName70PercentMatch: true,
      isRate100PercentMatch: false,
      isChallanWithoutPrice: false,
      suggestedStoredRate: storedItemRate,
      suggestedStoredItem: topCandidate.item,
      shouldUseStoredName: topCandidate.similarity >= 0.85,
      finalItemDescription: topCandidate.similarity >= 0.85 ? topCandidate.item.name : cleanRawDesc,
      finalItemId: topCandidate.item.id,
      finalSizeSpec: topCandidate.item.sizeSpec || '',
      finalUnit: finalUnit,
      finalRate: effectiveRate || storedItemRate,
      hasConflict: true,
      conflictReason: 'rate_mismatch',
      conflictMessage: `Conflict: Item name matched "${topCandidate.item.name}" (${Math.round(topCandidate.similarity * 100)}%), but Rate did not match 100% (${rateDiffMsg}).`,
      alternativeCandidates: highSimCandidates
    };
  }

  // 3. No match >= 70%
  const bestLowCandidate = candidates[0];
  return {
    importedDescription: cleanRawDesc,
    importedRate: effectiveRate,
    importedQty,
    importedUnit,
    importedAmount: importedAmount || (effectiveRate * importedQty),
    matchedStoredItem: null,
    similarityScore: bestLowCandidate?.similarity || 0,
    isName70PercentMatch: false,
    isRate100PercentMatch: false,
    isChallanWithoutPrice: isWithoutPrice,
    suggestedStoredRate: bestLowCandidate?.item.rate || 0,
    suggestedStoredItem: bestLowCandidate?.item || null,
    shouldUseStoredName: false,
    finalItemDescription: cleanRawDesc,
    finalItemId: undefined,
    finalSizeSpec: '',
    finalUnit: importedUnit || 'Coils',
    finalRate: effectiveRate,
    hasConflict: true, // Not 100% price + >=70% name match -> ask user to select from directory
    conflictReason: isWithoutPrice ? 'missing_price' : 'unmatched',
    conflictMessage: isWithoutPrice
      ? 'Challan item without price and not found in catalog. Please set price or select catalog item.'
      : `Unmatched item: "${cleanRawDesc}". Please select matching item from your directory.`,
    alternativeCandidates: candidates.slice(0, 3)
  };
}

/**
 * Auto-fixes a bill line item if its name has >= 70% match with a Master Catalog Item
 * AND its price/rate matches 100% (or exact rate match).
 */
export function autoFixBillLineItemWithMasterCatalog(
  line: BillLineItem,
  masterItems: Item[]
): { line: BillLineItem; wasFixed: boolean; originalName?: string; fixedName?: string } {
  if (!line || !line.itemDescription || !line.itemDescription.trim() || !masterItems || masterItems.length === 0) {
    return { line, wasFixed: false };
  }

  // Preserve user edited item names - never overwrite what the user explicitly changed
  if ((line as any).manuallyEdited || (line as any).userConfirmed) {
    return { line, wasFixed: false };
  }

  const desc = line.itemDescription.trim();
  const rate = Number(line.rate) || 0;

  // 1. If already an exact match with master item name: ensure standard casing and itemId
  const exactItem = masterItems.find(
    (i) => i.name.trim().toLowerCase() === desc.toLowerCase()
  );
  if (exactItem) {
    const isExactName = line.itemDescription === exactItem.name;
    const hasSameId = line.itemId === exactItem.id;
    if (!isExactName || !hasSameId) {
      return {
        line: {
          ...line,
          itemId: exactItem.id,
          itemDescription: exactItem.name,
          unit: line.unit || exactItem.unit || 'Coils',
          sizeSpec: exactItem.sizeSpec || line.sizeSpec || '',
          isSpecialItem: exactItem.isSpecialItem,
          baseItemId: exactItem.baseItemId,
          stockMultiplier: exactItem.stockMultiplier
        },
        wasFixed: !isExactName,
        originalName: desc,
        fixedName: exactItem.name
      };
    }
    return { line, wasFixed: false };
  }

  // 2. Fuzzy match against Master Item Catalog (>= 70% Name Match + 100% Price Match)
  const effectiveRate = rate > 0 ? rate : (line.amount && line.coilQty > 0 ? line.amount / line.coilQty : 0);

  const match = matchImportedItemWithStored(
    desc,
    effectiveRate,
    line.coilQty || 1,
    masterItems,
    line.unit,
    line.amount
  );

  if (match.shouldUseStoredName && match.matchedStoredItem && (match.isRate100PercentMatch || match.similarityScore >= 0.70)) {
    const finalDesc = match.finalItemDescription || match.matchedStoredItem.name;
    const isDifferent = line.itemDescription !== finalDesc || line.itemId !== match.matchedStoredItem.id || !line.rate;
    if (isDifferent) {
      // PRESERVE HISTORICAL RATE: If line already has a recorded rate > 0, NEVER overwrite with catalog rate!
      const finalRate = (line.rate && line.rate > 0) ? line.rate : (match.finalRate || 0);
      const finalAmount = (line.amount && line.amount > 0) ? line.amount : (line.coilQty && finalRate ? line.coilQty * finalRate : line.amount);
      return {
        line: {
          ...line,
          itemId: match.matchedStoredItem.id,
          itemDescription: finalDesc,
          unit: match.finalUnit || match.matchedStoredItem.unit || line.unit,
          rate: finalRate,
          amount: finalAmount,
          sizeSpec: match.matchedStoredItem.sizeSpec || line.sizeSpec || '',
          isSpecialItem: match.matchedStoredItem.isSpecialItem,
          baseItemId: match.matchedStoredItem.baseItemId,
          stockMultiplier: match.matchedStoredItem.stockMultiplier
        },
        wasFixed: true,
        originalName: desc,
        fixedName: finalDesc
      };
    }
  }

  return { line, wasFixed: false };
}

/**
 * Auto-fixes all previous / stored bills by matching unsaved / slightly different item names
 * having >= 70% name match and 100% price match with the Master Item catalog.
 * Stored bill rates and amounts are strictly preserved and NEVER mutated.
 */
export function autoFixStoredBillsWithMasterCatalog(
  bills: StoredBill[],
  masterItems: Item[]
): { fixedBills: StoredBill[]; totalFixedCount: number } {
  if (!Array.isArray(bills) || bills.length === 0 || !Array.isArray(masterItems) || masterItems.length === 0) {
    return { fixedBills: bills || [], totalFixedCount: 0 };
  }

  let totalFixedCount = 0;
  const fixedBills = bills.map((bill) => {
    if (!bill || !Array.isArray(bill.lines) || bill.lines.length === 0) {
      return bill;
    }

    let billHadFix = false;
    const fixedLines = bill.lines.map((l) => {
      const originalRate = l.rate;
      const originalAmount = l.amount;
      const res = autoFixBillLineItemWithMasterCatalog(l, masterItems);
      // STRICT IMMUTABILITY: Stored bills must NEVER have historical rate or amount altered
      const preservedRate = (originalRate !== undefined && originalRate > 0) ? originalRate : res.line.rate;
      const preservedAmount = (originalAmount !== undefined && originalAmount > 0) ? originalAmount : res.line.amount;
      const fixedLine = {
        ...res.line,
        rate: preservedRate,
        amount: preservedAmount
      };

      if (res.wasFixed && (l.itemId !== fixedLine.itemId || l.itemDescription !== fixedLine.itemDescription)) {
        billHadFix = true;
        totalFixedCount++;
      }
      return fixedLine;
    });

    if (billHadFix) {
      return {
        ...bill,
        lines: fixedLines
      };
    }
    return bill;
  });

  return { fixedBills, totalFixedCount };
}

