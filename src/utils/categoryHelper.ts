import { isReCableItem } from './requisitionExcelHelper';

export const DEFAULT_CATEGORIES = [
  'BYA',
  'BYFY',
  'Flexible',
  'Flexible Cable- 01 Core',
  'BYM',
  'Flexible Cable- 02 Core',
  'Flexible Cable- 03 Core',
  'Flexible Cable- 04 Core',
  'Arial Cable',
  'Telephone Cable',
  'Optical Fiber Cable'
];

/**
 * Checks if a cable item requires the Color Quantity Input Form.
 * Rule: Color input form is strictly for:
 * 1. BYA
 * 2. Flexible Cable- 01 Core (single core only, NOT 02/03/04 core / multi-core)
 * 3. Aluminium Category cable (Arial / Aluminium / D-11 / D-12)
 * WITHOUT RE items (e.g. 1.0re, 1.3re, 1.5re, 2.0re, 2.5re, 1-w solid).
 * And if entering an office bill (isOfficeBill / billType === 'office'), color input form is NOT shown.
 */
export function isColorApplicableCable(item?: {
  name?: string;
  itemName?: string;
  itemDescription?: string;
  sizeSpec?: string;
  spec?: string;
  category?: string;
  itemCategory?: string;
  description?: string;
  isOfficeBill?: boolean;
  billType?: string;
  [key: string]: any;
}): boolean {
  if (!item) return false;
  // Office bill entry strictly does NOT use colour input form
  if (item.isOfficeBill || item.billType === 'office') return false;

  const name = (item.name || item.itemName || item.itemDescription || item.description || '').toLowerCase();
  const spec = (item.sizeSpec || item.spec || '').toLowerCase();
  const cat = (item.category || item.itemCategory || '').toLowerCase();
  const combined = `${name} ${spec} ${cat}`;

  // 1. Arial Cable has NO colour ("Arial Cable have no colour and its always in meters.")
  const isArial =
    cat.includes('arial') ||
    cat.includes('aerial') ||
    name.includes('arial') ||
    name.includes('aerial') ||
    spec.includes('arial') ||
    spec.includes('aerial') ||
    /\bd-\s*1[12]\b/i.test(combined) ||
    combined.includes('drop wire') ||
    combined.includes('(alu)') ||
    (cat.includes('alu') && !combined.includes('bya'));

  if (isArial) {
    return false;
  }

  // 2. If it's an RE item (Round Solid / Single strand e.g. 1.0re, 1.3re, 1.5re, 2.0re, 2.5re, 1-w), NO color form
  if (isReCableItem(name, spec, cat) || /\bre\b/i.test(name) || /\b\(re\)\b/i.test(name) || name.includes('(re)')) {
    return false;
  }

  // 3. Check if it is multi-core or non-color cable (02 core, 03 core, 04 core, 2 core, 3 core, 4 core, twin, 2c, 3c, 4c, telephone, bym, byfy, xlpe, h.t, l.t, screened, armoured, TT, FT) -> NO color form
  const isMultiCoreOrNonApplicable =
    cat.includes('02 core') ||
    cat.includes('03 core') ||
    cat.includes('04 core') ||
    cat.includes('2 core') ||
    cat.includes('3 core') ||
    cat.includes('4 core') ||
    cat.includes('bym') ||
    cat.includes('byfy') ||
    cat.includes('telephone') ||
    cat.includes('xlpe') ||
    cat.includes('h.t') ||
    cat.includes('l.t') ||
    cat.includes('tape screen') ||
    cat.includes('wire screen') ||
    cat.includes('armour') ||
    cat.includes('armor') ||
    cat.includes('nyy') ||
    cat.includes('nym') ||
    cat.includes('power cable') ||
    cat.includes('control cable') ||
    name.includes('02 core') ||
    name.includes('03 core') ||
    name.includes('04 core') ||
    name.includes('2 core') ||
    name.includes('3 core') ||
    name.includes('4 core') ||
    name.includes('bym') ||
    name.includes('byfy') ||
    name.includes('telephone') ||
    name.includes('xlpe') ||
    combined.includes('t/t') ||
    combined.includes('twin twisted') ||
    combined.includes('f/t') ||
    combined.includes('flat twin') ||
    combined.includes('4/c') ||
    /\b(2|3|4|two|three|four)\s*(core|c)\b/i.test(combined) ||
    /\b[234]\s*x\s*/i.test(name) ||
    /\btwin\b/i.test(combined);

  if (isMultiCoreOrNonApplicable) {
    return false;
  }

  // 4. Flexible Cable- 01 Core: ALL ITEMS HAVE COLOUR!
  // ("Flexible Cable- 01 Core all item have colour, so it's need colour input form on sales or import.")
  const isFlexible01Core =
    cat.includes('flexible cable- 01 core') ||
    cat.includes('flexible cable - 01 core') ||
    (cat.includes('flexible') && (cat.includes('01 core') || cat.includes('1 core') || cat.includes('single core'))) ||
    (cat.includes('flexible') && (name.includes('1 x 2 rm') || name.includes('1 x 3 rm') || name.includes('1 x 1.5 rm') || name.includes('1 x 2.5 rm') || name.includes('1 x 4 rm')));

  if (isFlexible01Core) {
    return true;
  }

  // Other flexible cables (not 01 core) have NO color
  if (cat.includes('flexible') || name.includes('flexible')) {
    if (name.includes('1 x') || name.includes('1x')) {
      return true;
    }
    return false;
  }

  // 5. BYA cables (category 'BYA' or name/spec containing 'bya' or 'rm' single core, or '7/' or '3/' or '19/' strands)
  const isBya =
    cat === 'bya' ||
    cat.includes('bya') ||
    name.includes('bya') ||
    spec.includes('bya') ||
    (/\b\d+(\.\d+)?\s*rm\b/i.test(name) && !cat.includes('telephone')) ||
    (/\b[37]\/\d+\b/.test(combined) && !cat.includes('telephone') && !cat.includes('02') && !cat.includes('03') && !cat.includes('04'));

  return isBya;
}

/**
 * Returns distinct, vibrant badge style for all cable categories
 */
export function getCategoryBadgeStyle(category?: string): { bg: string; text: string; border: string } {
  const cat = (category || '').trim().toLowerCase();
  if (cat.includes('xlpe') || cat.includes('h.t') || cat.includes('l.t') || cat.includes('tape screen') || cat.includes('wire screen')) {
    return { bg: 'bg-sky-100', text: 'text-sky-900', border: 'border-sky-300' };
  }
  if (cat.includes('nyy') || cat.includes('nym') || cat.includes('armour') || cat.includes('power')) {
    return { bg: 'bg-violet-100', text: 'text-violet-900', border: 'border-violet-300' };
  }
  if (cat.includes('bya')) {
    return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' };
  }
  if (cat.includes('arial') || cat.includes('alu')) {
    return { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-300' };
  }
  if (cat.includes('bym')) {
    return { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' };
  }
  if (cat.includes('byfy')) {
    return { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' };
  }
  if (cat.includes('01 core') || cat.includes('1 core')) {
    return { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' };
  }
  if (cat.includes('02 core') || cat.includes('2 core')) {
    return { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300' };
  }
  if (cat.includes('03 core') || cat.includes('3 core')) {
    return { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300' };
  }
  if (cat.includes('04 core') || cat.includes('4 core')) {
    return { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' };
  }
  if (cat.includes('flexible')) {
    return { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' };
  }
  if (cat.includes('optical') || cat.includes('fiber') || cat.includes('ofc')) {
    return { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-300' };
  }
  if (cat.includes('telephone')) {
    return { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' };
  }
  return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' };
}

const CATEGORY_NUMBERS_KEY = 'polycables_category_numbers';

export function getCategoryNumbers(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CATEGORY_NUMBERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const clean: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed)) {
          const trimmed = cleanCategoryLabel(k);
          const num = Number(v);
          if (trimmed && !isNaN(num) && num > 0) {
            clean[trimmed.toLowerCase()] = num;
          }
        }
        return clean;
      }
    }
  } catch {}
  return {};
}

export function saveCategoryNumbers(numbersMap: Record<string, number>): Record<string, number> {
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(numbersMap || {})) {
    const trimmed = cleanCategoryLabel(k);
    const num = Number(v);
    if (trimmed && !isNaN(num) && num > 0) {
      clean[trimmed.toLowerCase()] = num;
    }
  }
  try {
    localStorage.setItem(CATEGORY_NUMBERS_KEY, JSON.stringify(clean));
  } catch (e) {
    console.error('Failed to save category numbers', e);
  }
  return clean;
}

export function getCategoryNumber(catName: string, fallbackIndex?: number): number {
  const map = getCategoryNumbers();
  const key = cleanCategoryLabel(catName).toLowerCase();
  if (key && map[key] !== undefined) {
    return map[key];
  }
  return fallbackIndex !== undefined ? fallbackIndex + 1 : 9999;
}

export function getAllCategories(): string[] {
  let deletedSet = new Set<string>();
  try {
    const deletedSaved = localStorage.getItem('polycables_deleted_categories');
    if (deletedSaved) {
      const parsed = JSON.parse(deletedSaved);
      if (Array.isArray(parsed)) {
        parsed.forEach((d: string) => deletedSet.add(d.toLowerCase().trim()));
      }
    }
  } catch {}

  const isNotGeneral = (c: string) => c && c.trim().toLowerCase() !== 'general' && !deletedSet.has(c.toLowerCase().trim());

  let baseList: string[] = [];
  try {
    const savedOrder = localStorage.getItem('polycables_ordered_categories');
    if (savedOrder) {
      const parsed = JSON.parse(savedOrder);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(isNotGeneral);
        if (filtered.length > 0) {
          baseList = filtered;
        }
      }
    }
  } catch {
    // fallback
  }

  if (baseList.length === 0) {
    try {
      const customSaved = localStorage.getItem('polycables_custom_categories');
      const custom = customSaved ? JSON.parse(customSaved) : [];
      const combined = [...DEFAULT_CATEGORIES];
      custom.forEach((c: string) => {
        if (!combined.some((item) => item.toLowerCase() === c.toLowerCase())) {
          combined.push(c);
        }
      });
      baseList = combined.filter(isNotGeneral);
    } catch {
      baseList = DEFAULT_CATEGORIES.filter(isNotGeneral);
    }
  }

  const numMap = getCategoryNumbers();
  if (Object.keys(numMap).length > 0) {
    return [...baseList].sort((a, b) => {
      const idxA = baseList.indexOf(a);
      const idxB = baseList.indexOf(b);
      const nA = numMap[cleanCategoryLabel(a).toLowerCase()] ?? (idxA + 10000);
      const nB = numMap[cleanCategoryLabel(b).toLowerCase()] ?? (idxB + 10000);
      if (nA !== nB) return nA - nB;
      return idxA - idxB;
    });
  }

  return baseList;
}

export function saveCategoryOrder(order: string[], customNumbers?: Record<string, number>): string[] {
  const cleanOrder: string[] = [];
  const seen = new Set<string>();
  for (const c of order) {
    const label = cleanCategoryLabel(c);
    if (!label) continue;
    const low = label.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      cleanOrder.push(label);
    }
  }

  const nextNumbers: Record<string, number> = {};
  if (customNumbers) {
    cleanOrder.forEach((c, idx) => {
      const k = c.toLowerCase();
      const val = Number(customNumbers[k]);
      nextNumbers[k] = !isNaN(val) && val > 0 ? val : idx + 1;
    });
    cleanOrder.sort((a, b) => {
      const nA = nextNumbers[a.toLowerCase()] ?? 9999;
      const nB = nextNumbers[b.toLowerCase()] ?? 9999;
      return nA - nB;
    });
  } else {
    cleanOrder.forEach((c, idx) => {
      nextNumbers[c.toLowerCase()] = idx + 1;
    });
  }

  try {
    saveCategoryNumbers(nextNumbers);
    localStorage.setItem('polycables_ordered_categories', JSON.stringify(cleanOrder));
    window.dispatchEvent(new CustomEvent('categories-updated', { detail: cleanOrder }));
    window.dispatchEvent(new Event('storage'));
  } catch (e) {
    console.error('Failed to save category order', e);
  }
  return cleanOrder;
}

export function saveCustomCategory(catName: string): string[] {
  const current = getAllCategories();
  const trimmed = cleanCategoryLabel(catName);
  if (trimmed && !current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    const existingNums = getCategoryNumbers();
    const maxNum = Object.values(existingNums).reduce((m, n) => (n > m ? n : m), current.length);
    const updated = [...current, trimmed];
    existingNums[trimmed.toLowerCase()] = maxNum + 1;
    // Also persist to custom categories
    try {
      const customSaved = localStorage.getItem('polycables_custom_categories');
      const custom: string[] = customSaved ? JSON.parse(customSaved) : [];
      if (Array.isArray(custom) && !custom.some((x) => x.toLowerCase().trim() === trimmed.toLowerCase())) {
        custom.push(trimmed);
        localStorage.setItem('polycables_custom_categories', JSON.stringify(custom));
      }
      const deletedSaved = localStorage.getItem('polycables_deleted_categories');
      if (deletedSaved) {
        const parsed = JSON.parse(deletedSaved);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((d: string) => d.toLowerCase().trim() !== trimmed.toLowerCase());
          localStorage.setItem('polycables_deleted_categories', JSON.stringify(filtered));
        }
      }
    } catch {}
    return saveCategoryOrder(updated, existingNums);
  }
  return current;
}

export function updateCategoryNumberAndName(
  oldName: string,
  newNumber: number,
  newName: string
): { ordered: string[]; custom: string[]; deleted: string[]; numbers: Record<string, number> } {
  const cleanOld = cleanCategoryLabel(oldName);
  const cleanNew = cleanCategoryLabel(newName) || cleanOld;
  const oldKey = cleanOld.toLowerCase();
  const newKey = cleanNew.toLowerCase();
  const targetNum = !isNaN(Number(newNumber)) && Number(newNumber) > 0 ? Number(newNumber) : 1;

  const current = getAllCategories();
  const existingNums = getCategoryNumbers();

  // Build ordered list with oldName renamed to cleanNew (or merged if newKey already exists)
  const renamedList: string[] = [];
  const seen = new Set<string>();
  let foundOld = false;
  for (const c of current) {
    const cLow = cleanCategoryLabel(c).toLowerCase();
    if (cLow === oldKey) {
      foundOld = true;
      if (!seen.has(newKey)) {
        seen.add(newKey);
        renamedList.push(cleanNew);
      }
    } else if (!seen.has(cLow)) {
      seen.add(cLow);
      renamedList.push(c);
    }
  }
  if (!foundOld && cleanNew && !seen.has(newKey)) {
    renamedList.push(cleanNew);
  }

  // Reassign clean numbers with target placed at requested number position
  const withoutTarget = renamedList.filter((c) => c.toLowerCase() !== newKey);
  withoutTarget.sort((a, b) => {
    const nA = existingNums[a.toLowerCase()] ?? (renamedList.indexOf(a) + 1);
    const nB = existingNums[b.toLowerCase()] ?? (renamedList.indexOf(b) + 1);
    return nA - nB;
  });

  const insertIdx = Math.max(0, Math.min(withoutTarget.length, Math.round(targetNum) - 1));
  const reordered = [...withoutTarget];
  reordered.splice(insertIdx, 0, cleanNew);

  const nextNumbers: Record<string, number> = {};
  reordered.forEach((c, idx) => {
    nextNumbers[c.toLowerCase()] = idx + 1;
  });
  // Preserve decimal or custom number if user explicitly entered a non-integer or specific number when unique
  if (!Number.isInteger(targetNum) || !Object.values(nextNumbers).some((v, i) => i !== insertIdx && v === targetNum)) {
    nextNumbers[newKey] = targetNum;
  }

  // Update custom categories list
  let customList: string[] = [];
  let deletedList: string[] = [];
  try {
    const customSaved = localStorage.getItem('polycables_custom_categories');
    const parsedCustom = customSaved ? JSON.parse(customSaved) : [];
    if (Array.isArray(parsedCustom)) {
      customList = parsedCustom
        .map((c: string) => (cleanCategoryLabel(c).toLowerCase() === oldKey ? cleanNew : c))
        .filter((c: string, idx: number, arr: string[]) =>
          arr.findIndex((x) => cleanCategoryLabel(x).toLowerCase() === cleanCategoryLabel(c).toLowerCase()) === idx
        );
      if (oldKey !== newKey && !customList.some((c) => cleanCategoryLabel(c).toLowerCase() === newKey)) {
        customList.push(cleanNew);
      }
      localStorage.setItem('polycables_custom_categories', JSON.stringify(customList));
    }
    const delSaved = localStorage.getItem('polycables_deleted_categories');
    const parsedDel = delSaved ? JSON.parse(delSaved) : [];
    if (Array.isArray(parsedDel)) {
      deletedList = parsedDel.filter((d: string) => d.toLowerCase().trim() !== newKey);
      localStorage.setItem('polycables_deleted_categories', JSON.stringify(deletedList));
    }
  } catch {}

  const finalOrdered = saveCategoryOrder(reordered, nextNumbers);
  return {
    ordered: finalOrdered,
    custom: customList,
    deleted: deletedList,
    numbers: getCategoryNumbers()
  };
}

export function deleteCategory(catName: string): string[] {
  const normName = catName.trim().toLowerCase();
  const current = getAllCategories();
  const updated = current.filter((c) => c.toLowerCase().trim() !== normName);

  const existingNums = getCategoryNumbers();
  delete existingNums[normName];

  // 1. Remove from polycables_custom_categories
  try {
    const customSaved = localStorage.getItem('polycables_custom_categories');
    if (customSaved) {
      const custom = JSON.parse(customSaved);
      if (Array.isArray(custom)) {
        const filteredCustom = custom.filter((c: string) => c.toLowerCase().trim() !== normName);
        localStorage.setItem('polycables_custom_categories', JSON.stringify(filteredCustom));
      }
    }
  } catch (e) {
    console.error('Error removing from custom categories', e);
  }

  // 2. Add to polycables_deleted_categories blacklist so defaults don't resurrect
  try {
    const deletedSaved = localStorage.getItem('polycables_deleted_categories');
    const deletedList: string[] = deletedSaved ? JSON.parse(deletedSaved) : [];
    if (!deletedList.some((d) => d.toLowerCase().trim() === normName)) {
      deletedList.push(normName);
      localStorage.setItem('polycables_deleted_categories', JSON.stringify(deletedList));
    }
  } catch (e) {
    console.error('Error recording deleted category', e);
  }

  return saveCategoryOrder(updated);
}

export function moveCategoryUp(index: number): string[] {
  const current = getAllCategories();
  if (index <= 0 || index >= current.length) return current;
  const updated = [...current];
  const temp = updated[index - 1];
  updated[index - 1] = updated[index];
  updated[index] = temp;
  return saveCategoryOrder(updated);
}

export function moveCategoryDown(index: number): string[] {
  const current = getAllCategories();
  if (index < 0 || index >= current.length - 1) return current;
  const updated = [...current];
  const temp = updated[index + 1];
  updated[index + 1] = updated[index];
  updated[index] = temp;
  return saveCategoryOrder(updated);
}

export function cleanCategoryLabel(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether text contains a concrete cable item conductor size, core×size, stranding, gauge, or item model
 * (e.g., "1 x 35 rm", "1.5 RM", "3 x 70 + 35 rm", "23/76", "7/.029", "2 Pair", "RG-6", "CAT-6", "D- 11 Insulated", "4/C").
 * Voltage ratings like "11 KV", "33 KV", "6.35/11 KV", "0.6/1 KV", "450/750 V" and core group labels like "01 Core"
 * are intentionally ignored so cable category banners are never mistaken for item names.
 */
export function hasConductorOrModelItemSpec(rawText: string): boolean {
  const cleaned = cleanCategoryLabel(rawText);
  if (!cleaned) return false;

  // Strip dates and voltage ratings (e.g. "6.35/11 KV", "0.6/1 KV", "11 KV", "450/750 V") so voltage slashes don't look like stranding
  const withoutVoltage = cleaned
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?)?\s*(?:kv|volts?|v)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!withoutVoltage) return false;

  // 1. Cross-sectional area / conductor type / wire gauge (e.g. "1.5 RM", "35rm", "95 sq.mm", "18 SWG")
  if (/\b\d+(?:\.\d+)?\s*(?:rm|re|sm|se|sq\.?\s*mm|sqmm|mm2|mm²|mm|awg|swg|gaj|mcm|kcmil)\b/i.test(withoutVoltage)) {
    return true;
  }

  // 2. Core × Size or Strand × Diameter (e.g. "1 x 35", "3 x 70", "3.5 x 50", "2 X 14/76", "3C x 95")
  if (/\b\d+(?:\.\d+)?\s*c?\s*[x×*]\s*\d+(?:\.\d+)?/i.test(withoutVoltage)) {
    return true;
  }

  // 3. Wire stranding notation (e.g. "3/22", "7/.029", "7/0.65", "23/76", "8/.0076", "70/76", "110/76")
  if (/\b\d+\s*\/\s*\.?\d+(?:\.\d+)?\b/.test(withoutVoltage)) {
    return true;
  }

  // 4. Shorthand multi-core item like "4/C", "3/C", "2/C"
  if (/^\d+\s*\/\s*c$/i.test(withoutVoltage)) {
    return true;
  }

  // 5. Telecom pair count items (e.g. "1 Pair", "2 Pair", "4 Pair", "10 Pair")
  if (/\b\d+\s*(?:pair|pairs|pr)\b/i.test(withoutVoltage)) {
    return true;
  }

  // 6. Specific Coaxial / Drop-wire / Network / Overhead conductor item models
  if (/\brg\s*-?\s*\d+\b/i.test(withoutVoltage)) return true;
  if (/\b[35]c\s*-\s*2v\b/i.test(withoutVoltage)) return true;
  if (/\bd\s*-\s*1[12]\b/i.test(withoutVoltage)) return true;
  if (/\bcat\s*-?\s*[567][ea]?\b/i.test(withoutVoltage) && !/\bcables?\b/i.test(withoutVoltage)) return true;
  if (/\b(?:dog|wolf|panther|rabbit|weasel|raccoon|ferret|mink|beaver|gopher|ant|gnat|wasp|hornet)\b/i.test(withoutVoltage)) {
    return true;
  }

  // 7. Special coil/drum length or explicit SKU code
  if (/\b\d+\s*(?:m|mtr|meter|meters)\s*(?:length|coil|bobin|drum)\b/i.test(withoutVoltage)) return true;
  if (/^pc\s*-\s*\d+/i.test(withoutVoltage)) return true;

  // 8. Optical Fiber cable core specifications (e.g. "Optical Fiber Cable 1 Core", "Optical Fiber Cable 2 Core", "Optical Fiber Cable 4 Core", "6 Core Optical Fiber", "1 Core", "2 Core", "4 Core")
  if (
    (/\b(?:optical\s*(?:fiber|cable)?|fiber\s*(?:optic|cable)?|ofc|ftth|drop\s*cable)\b/i.test(withoutVoltage) &&
      /\b\d+\s*(?:core|cores|c)\b/i.test(withoutVoltage)) ||
    /^\s*(?:optical\s*(?:fiber\s*)?cable\s*)?0?\d+\s*(?:core|cores)\s*$/i.test(withoutVoltage)
  ) {
    return true;
  }

  return false;
}

const NON_CATEGORY_HEADER_OR_JUNK = new Set([
  'sl', 'sl.', 'sl no', 'sl. no', 's.l', 's.l.', 'sl#', 'sl #', 'no', 'no.', 'serial', 'serial no',
  'item', 'items', 'item name', 'items name', 'item description', 'items description',
  'item name / description', 'item description / name', 'description', 'particular', 'particulars',
  'product', 'product name', 'name', 'name of items', 'name of item', 'name of cable', 'cable name',
  'size', 'cable size', 'size of cable', 'conductor size', 'size / specification', 'specification', 'specifications',
  'rate', 'price', 'unit price', 'rate (tk)', 'price (tk)', 'mrp', 'tk', 'amount', 'total', 'subtotal',
  'sub total', 'grand total', 'grand warehouse total', 'category', 'categories', 'unit', 'units',
  'code', 'item code', 'opening stock', 'closing stock', 'remarks', 'notes', 'note',
  'poly cables', 'polycables', 'poly cables ind. ltd.', 'poly cables industries ltd.',
  'madhupur', 'sales center', 'madhupur sales center', 'price list', 'stock serial report',
  'stock serial report (category wise)', 'holding no', 'holding no.', 'authorized signature'
]);

/**
 * Checks if a banner line is a sub-category qualifier (e.g. "(Copper Tape Screen)", "(Armoured)", "(Un-Armoured)",
 * "(Without RE)", "11 KV", "6.35/11 KV") that should combine with an immediately preceding main category banner
 * (e.g. "(H.T XLPE Cable)" + "(Copper Tape Screen)" -> "(H.T XLPE Cable) (Copper Tape Screen)").
 */
export function isSubCategoryQualifier(rawText: string): boolean {
  const s = cleanCategoryLabel(rawText);
  if (!s || hasConductorOrModelItemSpec(s)) return false;

  // Pure voltage banner like "11 KV", "6.35/11 KV", "0.6/1 KV"
  if (/^(?:\(?\s*\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?)?\s*(?:kv|v)\s*\)?\s*)+$/i.test(s)) {
    return true;
  }

  // Screening / armouring / RE / sheathing qualifier (typically parenthesized) without its own standalone cable family word
  const hasCableFamily =
    /\b(bya|bym|byfy|nyy|nym|xlpe|flexible|arial|aerial|telephone|domestic|submersible|control|co-?axial|welding|solar|automobile)\b/i.test(
      s
    );
  if (hasCableFamily) return false;

  return /\b(copper\s+tape\s+screen(?:ed)?|copper\s+wire\s+screen(?:ed)?|metallic\s+screen(?:ed)?|tape\s+screen(?:ed)?|wire\s+screen(?:ed)?|un-?screened|screened|armoured|armored|un-?armoured|un-?armored|non-?armoured|steel\s+tape|steel\s+wire|without\s+re|with\s+re|pvc\s+sheathed|frls|lszh)\b/i.test(
    s
  );
}

/**
 * Strictly identifies pure Cable Category / Group / Construction titles such as:
 * "(H.T XLPE Cable) (Copper Tape Screen)", "H.T XLPE Cable", "(Copper Tape Screen)",
 * "L.T XLPE Cable (Armoured)", "BYA (Without RE)", "Flexible Cable- 01 Core", etc.
 * Always returns FALSE if the text contains any actual cable item size/conductor/model specification.
 */
export function isPureCableCategoryLabel(
  rawText: string,
  extraKnownCategories?: Iterable<string>
): boolean {
  const s = cleanCategoryLabel(rawText);
  if (!s || s.length > 160) return false;

  const lower = s.toLowerCase();
  if (NON_CATEGORY_HEADER_OR_JUNK.has(lower)) return false;
  if (
    lower.includes('poly cables ind') ||
    lower.includes('madhupur sales') ||
    lower.includes('grand warehouse total') ||
    lower.startsWith('subtotal') ||
    lower.startsWith('grand total')
  ) {
    return false;
  }

  // Optical fiber cables with specific core counts are ALWAYS item products, NEVER pure category banners!
  if (
    (/\b(?:optical|fiber|ofc)\b/i.test(s) && /\b\d+\s*(?:core|cores|c)\b/i.test(s)) ||
    /^\s*(?:optical\s*(?:fiber\s*)?cable\s*)?0?\d+\s*(?:core|cores)\s*$/i.test(s)
  ) {
    return false;
  }

  // Never classify an actual cable size/conductor/model item as a category!
  if (hasConductorOrModelItemSpec(s)) {
    return false;
  }

  // Check default & saved categories
  const knownSet = new Set<string>(DEFAULT_CATEGORIES.map((c) => c.trim().toLowerCase()));
  for (const c of getAllCategories()) {
    const cl = c.trim().toLowerCase();
    if (cl && !hasConductorOrModelItemSpec(c)) knownSet.add(cl);
  }
  if (extraKnownCategories) {
    for (const c of extraKnownCategories) {
      const cl = String(c || '').trim().toLowerCase();
      if (cl && !hasConductorOrModelItemSpec(String(c))) knownSet.add(cl);
    }
  }
  if (knownSet.has(lower)) return true;

  // Parenthesized category/construction group(s), e.g. "(H.T XLPE Cable) (Copper Tape Screen)", "(Armoured)"
  if (
    /^(?:\([^()]+\)\s*)+$/.test(s) &&
    /\b(cables?|wires?|xlpe|pvc|screen(?:ed)?|tape|armour(?:ed)?|armor(?:ed)?|core|copper|alu|aluminium|aluminum|insulated|sheathed|h\.?\s*t\.?|l\.?\s*t\.?|m\.?\s*v\.?|kv|flexible|flat|round|duplex|overhead|power|control|domestic|submersible)\b/i.test(
      s
    )
  ) {
    return true;
  }

  // Cable family codes & insulation/screening/armouring/group headers
  if (
    /\b(bya|bym|byfy|nyy|nym|nycy|aac|aaac|acsr|xlpe|h\.?\s*t\.?\s+xlpe|l\.?\s*t\.?\s+xlpe|h\.?\s*t\.?\s+cables?|l\.?\s*t\.?\s+cables?|m\.?\s*v\.?\s+cables?|high\s+tension|low\s+tension|medium\s+voltage|high\s+voltage|low\s+voltage)\b/i.test(
      s
    )
  ) {
    return true;
  }

  if (
    /\b(copper\s+tape\s+screen(?:ed)?|copper\s+wire\s+screen(?:ed)?|metallic\s+screen(?:ed)?|tape\s+screen(?:ed)?|wire\s+screen(?:ed)?|un-?screened|screened\s+cables?|armoured|armored|un-?armoured|un-?armored|non-?armoured|steel\s+tape\s+armoured|steel\s+wire\s+armoured|pvc\s+insulated|xlpe\s+insulated|pvc\s+sheathed|frls|lszh)\b/i.test(
      s
    )
  ) {
    return true;
  }

  if (
    /\b(flexible\s+cables?|flexible\s+wires?|single\s+core\s+cables?|multi\s*-?\s*core\s+cables?|flexible\s+cable[s\-–—\s]*0?[1-5]\s*core|flat\s+twin|twin\s+flat|twin\s+twisted|domestic\s+cables?|house\s+wiring|building\s+wires?|power\s+cables?|control\s+cables?|submersible\s+cables?|telephone\s+cables?|telecommunication\s+cables?|co-?axial\s+cables?|instrumentation\s+cables?|welding\s+cables?|solar\s+cables?|automobile\s+cables?|auto\s+cables?|auto\s+wires?|aerial\s+cables?|arial\s+cables?|aerial\s+bundled|overhead\s+conductors?|overhead\s+wires?|earthing\s+cables?|earthing\s+wires?|ecc\s+wires?|service\s+wires?|cctv\s+cables?|fire\s+resistant\s+cables?)\b/i.test(
      s
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Heuristically categorizes cable items based on their name and specification
 */
export function categorizeCableItem(name: string, spec?: string): string {
  const combinedRaw = `${name || ''} ${spec || ''}`.trim();
  const text = combinedRaw.toLowerCase();

  if (text.includes('optical') || text.includes('fiber') || text.includes('ofc')) {
    return 'Optical Fiber Cable';
  }

  if (text.includes('h.t') && text.includes('xlpe') && text.includes('copper tape screen')) {
    return '(H.T XLPE Cable) (Copper Tape Screen)';
  }
  if (text.includes('h.t') && text.includes('xlpe')) {
    return 'H.T XLPE Cable';
  }
  if (text.includes('l.t') && text.includes('xlpe')) {
    return 'L.T XLPE Cable';
  }
  if (text.includes('xlpe')) {
    return 'XLPE Cable';
  }
  if (text.includes('nyy')) {
    return 'NYY';
  }
  if (text.includes('nym')) {
    return 'NYM';
  }
  if (text.includes('control cable')) {
    return 'Control Cable';
  }
  if (text.includes('arial') || text.includes('aerial') || text.includes('alu') || text.includes('drop wire')) {
    return 'Arial Cable';
  }
  if (text.includes('telephone') || text.includes('tele') || text.includes('submersible')) {
    return 'Telephone Cable';
  }
  if (text.includes('byfy') || text.includes('f/t') || text.includes('flat twin') || text.includes('twin flat')) {
    return 'BYFY';
  }
  if (text.includes('bym') || text.includes('round multicore')) {
    return 'BYM';
  }
  if (text.includes('flexible') || text.includes('flex')) {
    if (text.includes('02 core') || text.includes('2 core') || text.includes('2c') || text.includes('2-core')) return 'Flexible Cable- 02 Core';
    if (text.includes('03 core') || text.includes('3 core') || text.includes('3c') || text.includes('3-core')) return 'Flexible Cable- 03 Core';
    if (text.includes('04 core') || text.includes('4 core') || text.includes('4c') || text.includes('4-core')) return 'Flexible Cable- 04 Core';
    return 'Flexible Cable- 01 Core';
  }
  if (text.includes('bya') || text.includes('single core') || text.includes('rm') || text.includes('re')) {
    return 'BYA';
  }
  return 'Single Core Wires';
}

