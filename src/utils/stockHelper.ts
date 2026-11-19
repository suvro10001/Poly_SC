import { Item, FactoryImportChallan, ColorExchangeChallan } from '../types';

/**
 * Checks if an item is active for a specific sales center / branch.
 */
export function isItemActiveInBranch(
  item: Item | null | undefined,
  branchId?: string,
  branchName?: string
): boolean {
  if (!item) return false;
  if (item.isActive === false) return false;

  if (!branchId || branchId === 'ALL') {
    return true;
  }

  if (item.branchActiveStatus && Object.keys(item.branchActiveStatus).length > 0) {
    if (branchId && item.branchActiveStatus[branchId] !== undefined) {
      return item.branchActiveStatus[branchId] !== false;
    }
    if (branchName && item.branchActiveStatus[branchName] !== undefined) {
      return item.branchActiveStatus[branchName] !== false;
    }
    const targetId = branchId.toLowerCase().trim();
    const targetName = (branchName || '').toLowerCase().trim();
    for (const [key, val] of Object.entries(item.branchActiveStatus)) {
      const k = key.toLowerCase().trim();
      if (k === targetId || (targetName && (k === targetName || k.includes(targetName) || targetName.includes(k)))) {
        return val !== false;
      }
    }
  }

  return true;
}

/**
 * Returns branch-specific opening stock or general opening stock.
 */
export function getItemOpeningStock(item: Item, branchId?: string, branchName?: string): number {
  if (!item) return 0;
  if (branchId && branchId !== 'ALL') {
    if (branchId.includes(',')) {
      const branches = branchId.split(',').map((x) => x.trim()).filter(Boolean);
      return branches.reduce((acc, b) => acc + getItemOpeningStock(item, b), 0);
    }
    if (item.branchOpeningStock) {
      if (item.branchOpeningStock[branchId] !== undefined) {
        return Number(item.branchOpeningStock[branchId]) || 0;
      }
      if (branchName && item.branchOpeningStock[branchName] !== undefined) {
        return Number(item.branchOpeningStock[branchName]) || 0;
      }
      // Case-insensitive or clean match
      const targetId = branchId.toLowerCase().trim();
      const targetName = (branchName || '').toLowerCase().trim();
      for (const [key, val] of Object.entries(item.branchOpeningStock)) {
        const k = key.toLowerCase().trim();
        if (k === targetId || (targetName && (k === targetName || k.includes(targetName) || targetName.includes(k)))) {
          return Number(val) || 0;
        }
      }
    }
    // Default fallback ONLY for primary showroom (Madhupur Sales Center / branch-1 / branch-main)
    if (branchId === 'branch-1' || branchId === 'branch-main' || (branchName && branchName.toLowerCase().includes('madhupur'))) {
      return Number(item.openingStock) || 0;
    }
    // For other sales centers, if no branch-specific opening stock was configured, it is 0 (never inherit primary showroom stock)
    return 0;
  }
  // When viewing ALL sales centers: sum all branch opening stocks if configured
  if (item.branchOpeningStock && Object.keys(item.branchOpeningStock).length > 0) {
    const branchSum = Object.values(item.branchOpeningStock).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0
    );
    if (branchSum > 0) return branchSum;
  }
  return Number(item.openingStock) || 0;
}

/**
 * Accurately matches item lines against master item catalog.
 * Strict comparison prevents loose substring matching between different cable types (e.g. BYA vs BHA vs BYM vs NYY).
 */
export function isItemNameMatch(lineDesc: string, itemName: string, itemDisplayName?: string): boolean {
  if (!lineDesc || !itemName) return false;
  const l = lineDesc.toLowerCase().trim();
  const i = itemName.toLowerCase().trim();
  const d = (itemDisplayName || '').toLowerCase().trim();

  if (l === i || (d && l === d)) return true;

  const clean = (s: string) => s.replace(/[^\w\d]/g, ' ').replace(/\s+/g, ' ').trim();
  const clL = clean(l);
  const clI = clean(i);
  const clD = clean(d);
  if (clL === clI || (clD && clL === clD)) return true;

  // Distinct cable families that must NEVER match each other
  const cableFamilies = ['bya', 'bha', 'bym', 'nyy', 'byfy', 'lszh', 'telephone', 'optical', 'drop', 'coaxial', 'submersible', 'xlpe', 'aerial', 'arial'];
  const lFamilies = cableFamilies.filter((f) => clL.split(' ').includes(f) || l.includes(f));
  const iFamilies = cableFamilies.filter((f) => clI.split(' ').includes(f) || i.includes(f));

  // If both have family tags and they don't share any, strictly disallow match
  if (lFamilies.length > 0 && iFamilies.length > 0) {
    const hasOverlap = lFamilies.some((f) => iFamilies.includes(f));
    if (!hasOverlap) return false;
  }

  // Check if normalized words match
  const lWords = clL.split(' ').filter(Boolean);
  const iWords = clI.split(' ').filter(Boolean);
  if (lWords.length === iWords.length && lWords.every((w, idx) => w === iWords[idx])) {
    return true;
  }

  return false;
}

/**
 * Calculates the total factory import quantity for a given item across all recorded factory import challans,
 * optionally filtered by destination sales center (branchId / branchName).
 */
export function getItemFactoryImportQty(
  item: Item,
  factoryImports: FactoryImportChallan[] = [],
  branchId?: string,
  branchName?: string
): number {
  if (!item) return 0;
  let totalChallanImport = 0;
  const targetId = (branchId || '').toLowerCase().trim();
  const targetName = (branchName || '').toLowerCase().trim();
  const targetBranchIds = targetId.includes(',') ? targetId.split(',').map((x) => x.trim()).filter(Boolean) : [targetId];

  if (Array.isArray(factoryImports)) {
    factoryImports.forEach((challan) => {
      // If specific branch(es) specified, filter by destination sales center
      if (branchId && branchId !== 'ALL') {
        const chBranchId = (challan.branchId || '').toLowerCase().trim();
        const chBranchName = (challan.branchName || (challan as any).salesCenter || '').toLowerCase().trim();
        const isMatch = targetBranchIds.some((tId) => {
          if (!tId) return false;
          return (
            (chBranchId && (chBranchId === tId || chBranchId === targetName)) ||
            (chBranchName && (chBranchName === targetName || chBranchName === tId || chBranchName.includes(targetName) || targetName.includes(chBranchName))) ||
            (!chBranchId && !chBranchName && (tId === 'branch-1' || tId === 'branch-main' || targetName.includes('madhupur')))
          );
        });
        if (!isMatch) return;
      }

      if (Array.isArray(challan.lines)) {
        const itemNormName = (item.name || '').toLowerCase().trim();
        const itemDisplayName = getItemDisplayName(item).toLowerCase().trim();
        const itemCode = (item.code || '').toLowerCase().trim();

        challan.lines.forEach((line) => {
          const lId = (line.itemId || '').trim();
          const lCode = (line.itemCode || '').toLowerCase().trim();
          const lName = (line.itemName || (line as any).itemDescription || '').toLowerCase().trim();

          const isDirectMatch =
            (lId ? lId === item.id : false) ||
            (!lId && itemCode && lCode && lCode === itemCode && (!lName || isItemNameMatch(lName, itemNormName, itemDisplayName))) ||
            (lName && isItemNameMatch(lName, itemNormName, itemDisplayName));

          if (isDirectMatch) {
            totalChallanImport += Number(line.quantity) || 0;
          }
        });
      }
    });
  }

  const hasImports = Array.isArray(factoryImports) && factoryImports.length > 0;
  const staticQty = (!hasImports && (!branchId || branchId === 'ALL' || branchId === 'branch-1'))
    ? Math.max(Number(item.addedStock) || 0, Number(item.importFactory) || 0)
    : 0;
  return totalChallanImport > 0 ? totalChallanImport : staticQty;
}

/**
 * Calculates incoming and outgoing quantities from Color Exchanges for a specific item and sales center.
 * Input side = Return into Showroom (+ In Coils)
 * Output side = Issued out to Party (- Out Coils)
 */
export function getItemColorExchanges(
  item: Item,
  colorExchanges: ColorExchangeChallan[] = [],
  branchId?: string,
  branchName?: string
): { exchangeIn: number; exchangeOut: number } {
  if (!item || !Array.isArray(colorExchanges)) return { exchangeIn: 0, exchangeOut: 0 };
  let exchangeIn = 0;
  let exchangeOut = 0;

  const targetId = (branchId || '').toLowerCase().trim();
  const targetName = (branchName || '').toLowerCase().trim();

  colorExchanges.forEach((ex) => {
    if (branchId && branchId !== 'ALL') {
      const exBranchId = (ex.branchId || '').toLowerCase().trim();
      const exBranchName = (ex.branchName || '').toLowerCase().trim();

      const isMatch =
        (exBranchId && (exBranchId === targetId || exBranchId === targetName)) ||
        (exBranchName && (exBranchName === targetName || exBranchName === targetId || exBranchName.includes(targetName) || targetName.includes(exBranchName))) ||
        (!exBranchId && !exBranchName && (targetId === 'branch-1' || targetId === 'branch-main' || targetName.includes('madhupur')));

      if (!isMatch) return;
    }

    if (Array.isArray(ex.lines)) {
      ex.lines.forEach((l) => {
        // Check input side (Return in from party -> Adds to showroom stock)
        const inMatch =
          (l.inItemId && l.inItemId === item.id) ||
          (l.inItemCode && l.inItemCode === item.code) ||
          (l.inItemName && l.inItemName.trim().toLowerCase() === item.name.trim().toLowerCase());

        if (inMatch) {
          const inEquiv = l.inCoilEquivalent !== undefined ? Number(l.inCoilEquivalent) || 0 : Number(l.inQty) || 0;
          exchangeIn += inEquiv;
        }

        // Check output side (Issued out to party -> Deducts from showroom stock)
        const outMatch =
          (l.outItemId && l.outItemId === item.id) ||
          (l.outItemCode && l.outItemCode === item.code) ||
          (l.outItemName && l.outItemName.trim().toLowerCase() === item.name.trim().toLowerCase());

        if (outMatch) {
          const outEquiv = l.outCoilEquivalent !== undefined ? Number(l.outCoilEquivalent) || 0 : Number(l.outQty) || 0;
          exchangeOut += outEquiv;
        }
      });
    }
  });

  return { exchangeIn, exchangeOut };
}

/**
 * Computes live store stock for an item considering opening stock, factory imports, returns, sales,
 * delivery challans, and color exchanges, strictly filtered by sales center (branchId / branchName).
 */
export function getItemLiveStock(
  item: Item,
  factoryImports: FactoryImportChallan[] = [],
  totalSales: number = 0,
  branchId?: string,
  storedBills: any[] = [],
  allItems: Item[] = [],
  stockReturns: any[] = [],
  deliveryChallans: any[] = [],
  colorExchanges: ColorExchangeChallan[] = [],
  branchName?: string
): number {
  if (!item) return 0;
  const opening = getItemOpeningStock(item, branchId, branchName);
  const imported = getItemFactoryImportQty(item, factoryImports, branchId, branchName);
  
  let sales = 0;
  if (Array.isArray(storedBills) && storedBills.length > 0) {
    sales = getItemTotalSales(item, storedBills, allItems, branchId, deliveryChallans, branchName);
  } else if (totalSales > 0) {
    sales = totalSales;
  } else if (!storedBills) {
    sales = (!branchId || branchId === 'ALL' || branchId === 'branch-1') ? (Number(item.totalSales) || 0) : 0;
  }

  const { partyReturn, factoryReturn } = getItemStockReturns(item, stockReturns, branchId, branchName);
  const { exchangeIn, exchangeOut } = getItemColorExchanges(item, colorExchanges, branchId, branchName);

  const rawStock = opening + imported + partyReturn + exchangeIn - sales - factoryReturn - exchangeOut;

  // If the item had ZERO total inflow (0 opening, 0 imported, 0 party return, 0 exchange in),
  // it was never stocked or received here; return 0 (no phantom negative stock).
  const totalInflow = opening + imported + partyReturn + exchangeIn;
  if (totalInflow === 0) {
    return 0;
  }

  return rawStock;
}

/**
 * Extracts meters per coil from an item's name or specifications (e.g. 305m, 90m, 500m)
 * Defaults to standard 100 meters per coil.
 */
export function getItemCoilMeters(item?: { name?: string; sizeSpec?: string } | null): number {
  if (!item) return 100;
  const str = `${item.name || ''} ${item.sizeSpec || ''}`.toLowerCase();
  const match = str.match(/\b(\d+(?:\.\d+)?)\s*(?:m\b|meter|metre|mtr)/i);
  if (match) {
    const val = parseFloat(match[1]);
    if (val > 0) return val;
  }
  return 100;
}

/**
 * Calculates total dynamic returns for an item from stock returns challans,
 * optionally filtered by branch (branchId / branchName).
 */
export function getItemStockReturns(
  item: Item,
  stockReturns: any[] = [],
  branchId?: string,
  branchName?: string
): { partyReturn: number; factoryReturn: number } {
  if (!item) return { partyReturn: 0, factoryReturn: 0 };
  let partyReturn = 0;
  let factoryReturn = 0;
  const targetId = (branchId || '').toLowerCase().trim();
  const targetName = (branchName || '').toLowerCase().trim();
  const targetBranchIds = targetId.includes(',') ? targetId.split(',').map((x) => x.trim()).filter(Boolean) : [targetId];

  const itemNormName = (item.name || '').toLowerCase().trim();
  const itemDisplayName = getItemDisplayName(item).toLowerCase().trim();
  const itemCode = (item.code || '').toLowerCase().trim();

  if (Array.isArray(stockReturns) && stockReturns.length > 0) {
    stockReturns.forEach((sr) => {
      if (branchId && branchId !== 'ALL') {
        const srBranchId = (sr.branchId || sr.header?.branchId || '').toLowerCase().trim();
        const srBranchName = (sr.branchName || (sr as any).salesCenter || '').toLowerCase().trim();
        const isBranchMatch = targetBranchIds.some((tId) => {
          if (!tId) return false;
          return (
            (srBranchId && (srBranchId === tId || srBranchId === targetName)) ||
            (srBranchName && (srBranchName === targetName || srBranchName === tId || srBranchName.includes(targetName) || targetName.includes(srBranchName))) ||
            (!srBranchId && !srBranchName && (tId === 'branch-1' || tId === 'branch-main' || targetName.includes('madhupur')))
          );
        });
        if (!isBranchMatch) return;
      }

      const rType = String(sr.returnType || sr.type || (sr as any).header?.returnType || '').toLowerCase().trim();
      const isParty = rType.includes('party') || rType.includes('customer') || rType === 'pr' || (!rType.includes('factory') && !rType.includes('fr'));

      if (Array.isArray(sr.lines)) {
        sr.lines.forEach((l: any) => {
          const lId = (l.itemId || '').trim();
          const lCode = (l.itemCode || '').toLowerCase().trim();
          const lName = (l.itemName || (l as any).itemDescription || '').toLowerCase().trim();

          const isDirectMatch =
            (lId ? lId === item.id : false) ||
            (!lId && itemCode && lCode && lCode === itemCode && (!lName || isItemNameMatch(lName, itemNormName, itemDisplayName))) ||
            (lName && isItemNameMatch(lName, itemNormName, itemDisplayName));

          if (isDirectMatch) {
            const qty = Number(l.quantity || (l as any).coilQty || (l as any).qty) || 0;
            const lineRType = String(l.returnType || '').toLowerCase().trim();
            const lineIsParty = lineRType ? (lineRType.includes('party') || lineRType.includes('customer')) : isParty;
            if (lineIsParty) {
              partyReturn += qty;
            } else {
              factoryReturn += qty;
            }
          }
        });
      }
    });
  }

  // Include static returns (only when no dynamic challan returns exist for this item)
  const staticParty = (!branchId || branchId === 'ALL' || branchId === 'branch-1') ? (Number(item.returnParty) || 0) : 0;
  const staticFactory = (!branchId || branchId === 'ALL' || branchId === 'branch-1') ? (Number(item.returnFactory) || 0) : 0;

  return {
    partyReturn: partyReturn > 0 ? partyReturn : staticParty,
    factoryReturn: factoryReturn > 0 ? factoryReturn : staticFactory
  };
}

/**
 * Calculates unbilled goods dispatched via Delivery Challans
 */
export function getItemChallanDispatches(
  item: Item,
  deliveryChallans: any[] = [],
  allItems: Item[] = [],
  branchId?: string,
  branchName?: string
): number {
  if (!item || !Array.isArray(deliveryChallans)) return 0;
  let totalChallanDispatches = 0;
  const targetId = (branchId || '').toLowerCase().trim();
  const targetName = (branchName || '').toLowerCase().trim();

  deliveryChallans.forEach((ch) => {
    if (ch.isBilled) return;

    if (branchId && branchId !== 'ALL') {
      const chBranchId = (ch.branchId || ch.header?.branchId || '').toLowerCase().trim();
      const chBranchName = (ch.branchName || (ch as any).branch || (ch as any).salesCenter || '').toLowerCase().trim();
      const isBranchMatch =
        (chBranchId && (chBranchId === targetId || chBranchId === targetName)) ||
        (chBranchName && (chBranchName === targetName || chBranchName === targetId || chBranchName.includes(targetName) || targetName.includes(chBranchName))) ||
        (!chBranchId && !chBranchName && (targetId === 'branch-1' || targetId === 'branch-main' || targetName.includes('madhupur')));
      if (!isBranchMatch) return;
    }

    if (Array.isArray(ch.lines)) {
      ch.lines.forEach((line: any) => {
        const unbilledQty = line.dueQty !== undefined
          ? Number(line.dueQty) || 0
          : Math.max(0, (Number(line.coilQty) || 0) - (Number(line.billedQty) || 0));

        if (unbilledQty <= 0) return;

        if (
          (line.itemId && line.itemId === item.id) ||
          (line.itemDescription && line.itemDescription.trim().toLowerCase() === item.name.trim().toLowerCase()) ||
          (line.itemName && line.itemName.trim().toLowerCase() === item.name.trim().toLowerCase()) ||
          (line.itemCode && line.itemCode === item.code)
        ) {
          totalChallanDispatches += unbilledQty;
        } else if (
          (line.baseItemId && line.baseItemId === item.id) ||
          (line.isSpecialItem && line.baseItemCode && line.baseItemCode === item.code)
        ) {
          const mult = Number(line.stockMultiplier) || 1;
          totalChallanDispatches += unbilledQty * mult;
        } else if (line.itemId) {
          const matchedItem = allItems.find((i) => i.id === line.itemId);
          if (matchedItem && matchedItem.isSpecialItem && matchedItem.baseItemId === item.id) {
            const mult = Number(matchedItem.stockMultiplier) || 1;
            totalChallanDispatches += unbilledQty * mult;
          }
        }
      });
    }
  });

  return totalChallanDispatches;
}

/**
 * Calculates total sales coils for an item from stored bills,
 * correctly attributing special item quantity multiplier to the base item,
 * optionally filtered by sales center (branchId / branchName).
 * Office bills are strictly excluded to ensure they do not deduct showroom/sales center stock.
 */
export function getItemTotalSales(
  item: Item,
  storedBills: any[] = [],
  allItems: Item[] = [],
  branchId?: string,
  deliveryChallans: any[] = [],
  branchName?: string
): number {
  if (!item) return 0;
  let totalSales = 0;
  const targetId = (branchId || '').toLowerCase().trim();
  const targetName = (branchName || '').toLowerCase().trim();
  const targetBranchIds = targetId.includes(',') ? targetId.split(',').map((x) => x.trim()).filter(Boolean) : [targetId];

  if (Array.isArray(storedBills)) {
    storedBills.forEach((bill) => {
      // Draft bills do NOT deduct stock
      if (bill.isDraft || bill.header?.isDraft || bill.status === 'draft') return;
      // Office bills (Factory Direct) do NOT deduct showroom/sales center stock
      const isOffice = Boolean(
        bill.isOfficeBill ||
        bill.header?.isOfficeBill ||
        bill.billType === 'office' ||
        bill.header?.billType === 'office' ||
        bill.type === 'office' ||
        bill.header?.type === 'office' ||
        (bill.header?.billTitle && String(bill.header.billTitle).toLowerCase().includes('office'))
      );
      if (isOffice) return;

      // Filter by branch if specified and not 'ALL'
      if (branchId && branchId !== 'ALL') {
        const billBranchId = (bill.header?.branchId || bill.branchId || '').toLowerCase().trim();
        const billBranchName = (bill.header?.branchName || bill.branchName || (bill as any).salesCenter || (bill.header as any)?.salesCenter || '').toLowerCase().trim();
        const isBranchMatch = targetBranchIds.some((tId) => {
          if (!tId) return false;
          return (
            (billBranchId && (billBranchId === tId || billBranchId === targetName)) ||
            (billBranchName && (billBranchName === targetName || billBranchName === tId || billBranchName.includes(targetName) || targetName.includes(billBranchName))) ||
            (!billBranchId && !billBranchName && (tId === 'branch-1' || tId === 'branch-main' || targetName.includes('madhupur')))
          );
        });
        if (!isBranchMatch) return;
      }

      if (Array.isArray(bill.lines)) {
        const itemNormName = (item.name || '').toLowerCase().trim();
        const itemDisplayName = getItemDisplayName(item).toLowerCase().trim();
        const itemCode = (item.code || '').toLowerCase().trim();

        bill.lines.forEach((line: any) => {
          const lId = (line.itemId || '').trim();
          const lCode = (line.itemCode || '').toLowerCase().trim();
          const lDesc = (line.itemDescription || line.itemName || '').toLowerCase().trim();

          const isDirectMatch =
            (lId ? lId === item.id : false) ||
            (!lId && itemCode && lCode && lCode === itemCode && (!lDesc || isItemNameMatch(lDesc, itemNormName, itemDisplayName))) ||
            (lDesc && isItemNameMatch(lDesc, itemNormName, itemDisplayName));

          if (isDirectMatch) {
            totalSales += Number(line.coilQty) || 0;
          } else if (
            (line.baseItemId && line.baseItemId === item.id) ||
            (line.isSpecialItem && line.baseItemCode && line.baseItemCode === item.code)
          ) {
            const mult = Number(line.stockMultiplier) || 1;
            totalSales += (Number(line.coilQty) || 0) * mult;
          } else if (line.itemId) {
            const matchedItem = allItems.find((i) => i.id === line.itemId || i.name === line.itemDescription);
            if (matchedItem && matchedItem.isSpecialItem && matchedItem.baseItemId === item.id) {
              const mult = Number(matchedItem.stockMultiplier) || 1;
              totalSales += (Number(line.coilQty) || 0) * mult;
            }
          }
        });
      }
    });
  }

  // Include unbilled delivery challan dispatches
  if (Array.isArray(deliveryChallans) && deliveryChallans.length > 0) {
    totalSales += getItemChallanDispatches(item, deliveryChallans, allItems, branchId, branchName);
  }

  return totalSales;
}

/**
 * Formats unit according to quantity:
 * 1 unit -> "Coil" / "Meter"
 * > 1 unit -> "Coils" / "Meters"
 */
export function formatDisplayUnit(unit: string | undefined | null, qty: number = 0): string {
  const isOne = Math.abs(qty) === 1;
  if (!unit) return isOne ? 'Coil' : 'Coils';
  const trimmed = unit.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'coil' || lower === 'coils' || lower.includes('coil')) {
    return isOne ? 'Coil' : 'Coils';
  }
  if (
    lower === 'meter' ||
    lower === 'meters' ||
    lower === 'mtr' ||
    lower === 'mtrs' ||
    lower.includes('meter') ||
    lower.includes('mtr')
  ) {
    return isOne ? 'Meter' : 'Meters';
  }
  return trimmed;
}

/**
 * Conversion constants:
 * 1 Coil = 100 meters
 * 1 Bobin = 500 meters (5 Coils)
 * 2 Bobins = 1000 meters (10 Coils)
 */
export const METERS_PER_COIL = 100;
export const METERS_PER_BOBIN = 500;
export const COILS_PER_BOBIN = 5;

/**
 * Checks if a unit string or description text represents a meter specification (mtr, meter, meters, etc.).
 */
export function isMeterUnitOrDescription(text?: string | null): boolean {
  if (!text) return false;
  return /\b(mtrs?|meters?|m\b|\(mtr\.?\)|\(meter\))/i.test(text);
}

/**
 * Determines whether an item or description should automatically use 'Bobin' as its unit.
 * IMPORTANT: Having 10 coils does NOT mean an item is a special item or a bobin.
 * Only items explicitly marked as special, with unit 'Bobin', or containing the word 'bobin' or '(500 m length)'
 * are identified as Bobin.
 */
export function isBobinItem(itemOrName?: { name?: string; unit?: string; isSpecialItem?: boolean } | string | null): boolean {
  if (!itemOrName) return false;
  if (typeof itemOrName === 'string') {
    // Matches explicit 'Bobin', or special length indicators like '(500 m Length)', '500m length'
    return /\bbobin\b|\b500\s*m\s*length\b|\(mtr\.?\)|\(meters?\.?\)/i.test(itemOrName);
  }
  if (itemOrName.isSpecialItem) {
    if (itemOrName.unit) return /^bobin$/i.test(itemOrName.unit.trim()) || /bobin/i.test(itemOrName.unit);
    return true; // Special items default to Bobin unless specified otherwise
  }
  if (itemOrName.unit && (/^bobin$/i.test(itemOrName.unit.trim()) || /bobin/i.test(itemOrName.unit))) {
    return true;
  }
  if (itemOrName.name && (/\bbobin\b|\b500\s*m\s*length\b|\(mtr\.?\)|\(meters?\.?\)/i.test(itemOrName.name))) {
    return true;
  }
  return false;
}

/**
 * Checks if a description denotes a special meter-length item e.g. 1 X 1.0 Rm 3-W (3/0.65) BYA (Mtr.) or 500m length.
 */
export function isSpecialMeterDescription(desc: string | undefined | null): boolean {
  if (!desc) return false;
  return /\(mtr\.?\)|\(meters?\.?\)|500\s*m\s*length|\bbobin\b/i.test(desc);
}

/**
 * Converts meter distance to equivalent coils (1 Coil = 100 meters).
 * e.g. 100m -> 1 Coil, 1000m -> 10 Coils, 500m -> 5 Coils
 */
export function convertMetersToCoils(meters: number): number {
  if (!meters || meters <= 0) return 0;
  return meters / METERS_PER_COIL;
}

/**
 * Converts meter distance to equivalent Bobins (1 Bobin = 500 meters = 5 Coils).
 * e.g. 1000m -> 2 Bobins, 500m -> 1 Bobin, 1500m -> 3 Bobins, 2000m -> 4 Bobins
 */
export function convertMetersToBobins(meters: number): number {
  if (!meters || meters <= 0) return 0;
  return meters / METERS_PER_BOBIN;
}

/**
 * Converts coils count to meters (1 Coil = 100 meters).
 */
export function convertCoilsToMeters(coils: number): number {
  if (!coils || coils <= 0) return 0;
  return coils * METERS_PER_COIL;
}

/**
 * Converts bobin count to meters (1 Bobin = 500 meters).
 */
export function convertBobinsToMeters(bobins: number): number {
  if (!bobins || bobins <= 0) return 0;
  return bobins * METERS_PER_BOBIN;
}

/**
 * Converts coil quantity or meter quantity to Bobin quantity ONLY for verified special/bobin items.
 * NOTE: Standard items with 10 coils are standard coil items and are NOT converted.
 */
export function convertCoilsToBobinQty(
  qty: number,
  unit?: string,
  multiplier: number = 5
): { bobinQty: number; equivalentCoils: number; converted: boolean } {
  if (!qty || qty <= 0) return { bobinQty: qty || 0, equivalentCoils: 0, converted: false };
  
  const cleanUnit = (unit || '').toLowerCase().trim();
  const metersPerBobin = multiplier * METERS_PER_COIL; // 5 * 100 = 500m
  
  // If unit is explicitly in meters (e.g. 1000 Mtr, 1000 Meter, 500 Mtr)
  if (cleanUnit.includes('mtr') || cleanUnit.includes('meter') || cleanUnit === 'm') {
    const bobins = qty / metersPerBobin;
    const coils = qty / METERS_PER_COIL;
    return {
      bobinQty: Number.isInteger(bobins) ? bobins : Math.round(bobins * 100) / 100,
      equivalentCoils: coils,
      converted: true
    };
  }

  // If unit is Bobin
  if (cleanUnit === 'bobin' || cleanUnit.includes('bobin')) {
    return {
      bobinQty: qty,
      equivalentCoils: qty * multiplier,
      converted: false
    };
  }

  // Regular coil item: 10 coils is 10 coils
  return { bobinQty: qty, equivalentCoils: qty, converted: false };
}

/**
/**
 * Formats an item's display name to include its category (e.g. '1 x 1.5 Rm BYA' or '1 x 1.5 Rm BYM')
 * if the category is not already present in the item's name.
 */
export function getItemDisplayName(
  item: { name?: string; category?: string; [key: string]: any } | null | undefined
): string {
  if (!item || !item.name) return '';
  const cleanName = item.name.trim();
  const category = (item.category || '').trim();
  if (!category) return cleanName;

  const lowCat = category.toLowerCase();
  // Skip generic bucket names
  if (lowCat === 'general' || lowCat === 'standard wires' || lowCat === 'all' || lowCat === 'uncategorized') {
    return cleanName;
  }

  const lowName = cleanName.toLowerCase();
  // If item name already contains the category, do not append again
  if (lowName.includes(lowCat)) {
    return cleanName;
  }

  // Also check if common acronyms like BYA / BYM / NYY are already in the name
  const catTokens = category.split(/\s+/).filter((t) => t.length >= 2);
  const allTokensInName = catTokens.length > 0 && catTokens.every((t) => lowName.includes(t.toLowerCase()));
  if (allTokensInName) {
    return cleanName;
  }

  return `${cleanName} ${category}`;
}

/**
 * When an item's name is displayed across tables, dropdowns, and lists,
 * this helper appends the category to make it distinct:
 * e.g., '1 x 1.5 Rm BYA', '1 x 1.5 Rm BYM'
 */
export function formatItemNameWithCategoryIfDuplicate(
  item: Item,
  allItems: Item[] = []
): string {
  return getItemDisplayName(item);
}

/**
 * Generates the standardized special item display name from a base item name and category.
 * e.g., '1 X 1.5 Rm (7-w)' + 'BYA' -> '1 X 1.5 Rm (7-w) BYA (500 m Length)'
 * e.g., '1 X 1.5 Rm (7-w)' + 'BYA FRLS SKIN COATED CABLE' -> '1 X 1.5 Rm (7-w) BYA FRLS SKIN COATED CABLE (500 m Length)'
 * e.g., '1 X 1.5 Rm (7-w)' + 'BYA-FRLS LINER' -> '1 X 1.5 Rm (7-w) BYA-FRLS LINER (500 m Length)'
 * e.g., '1 X 1.5 Rm (7-w)' + 'BYM' -> '1 X 1.5 Rm (7-w) BYM (500 m Length)'
 */
export function generateSpecialItemDisplayName(
  baseItemName: string,
  category?: string,
  lengthSuffix: string = '500 m Length'
): string {
  let clean = (baseItemName || '').trim();
  // Remove existing length/coil tags
  clean = clean
    .replace(/\s*\(\s*500\s*m\s*length\s*\)[^)]*/gi, '')
    .replace(/\s*-\s*\d+\s*coils?/gi, '')
    .replace(/\s*\(mtr\.?\)/gi, '')
    .replace(/\s*\(meters?\.?\)/gi, '')
    .trim();

  const cat = (category || '').trim();
  if (cat && !clean.toLowerCase().includes(cat.toLowerCase())) {
    return `${clean} ${cat} (${lengthSuffix})`;
  }
  return `${clean} (${lengthSuffix})`;
}

/**
 * Automatically calculates the special item price based on base item rate, deduct quantity, and unit.
 * Where 1 coil = 100 meters.
 * - If unit is Meters: price is calculated by meter where 1 coil = 100 meters.
 *   Rate per meter = baseRate / 100; total item rate = (baseRate / 100) * meters
 *   e.g. Base rate 4799, 500 meters -> (4799 / 100) * 500 = 23995
 *   e.g. Base rate 4799, 100 meters -> (4799 / 100) * 100 = 4799
 *   e.g. Base rate 4799, 1 meter -> 48
 * - If unit is Coils: price is calculated by coil:
 *   baseRate * coils
 *   e.g. Base rate 4799, 5 coils -> 4799 * 5 = 23995
 */
export function calculateSpecialItemRate(
  baseRate: number,
  deductValue: number = 5,
  unit: string = 'Coils'
): number {
  const bRate = Number(baseRate) || 0;
  const isMeter = /meters?|mtrs?|^m$/i.test((unit || '').trim());
  if (isMeter) {
    // 1 coil = 100 meters
    const meters = Number(deductValue) || 100;
    const rate = (bRate / 100) * meters;
    return Math.round(rate);
  }
  const coils = Number(deductValue) || 1;
  return Math.round(bRate * coils);
}

/**
 * Parses raw description, quantity, and unit to automatically decide Bobin quantity and unit.
 * Specifically:
 * - 1 Coil = 100 meters
 * - 1000 meters / 1000 mtr -> 2 Bobin (10 Coils)
 * - 500 meters / 500 mtr -> 1 Bobin (5 Coils)
 * - Where 'mtr' or 'meter' is seen, it identifies unit as 'Bobin'.
 */
export function parseSpecialMeterAndQtyToBobin(
  description: string,
  qty: number,
  unit?: string,
  isSpecialItem: boolean = false
): { parsedQty: number; parsedUnit: string; equivalentCoils: number; isConverted: boolean } {
  const cleanDesc = (description || '').trim();
  const cleanUnit = (unit || '').trim().toLowerCase();

  // Check if description has explicit meter pattern like "1000 mtr", "1000 meter", "500 mtr", "500 meter"
  const meterMatch = cleanDesc.match(/(\d+)\s*(?:mtrs?|meters?)\b/i);
  if (meterMatch) {
    const mtrVal = parseInt(meterMatch[1], 10);
    if (mtrVal >= 100) {
      const bobinCount = mtrVal / METERS_PER_BOBIN;
      const coilsCount = mtrVal / METERS_PER_COIL;
      return {
        parsedQty: Number.isInteger(bobinCount) ? bobinCount : Math.round(bobinCount * 100) / 100,
        parsedUnit: 'Bobin',
        equivalentCoils: coilsCount,
        isConverted: true
      };
    }
  }

  // If unit or item is explicitly Bobin or special meter
  const hasMeterInUnit = isMeterUnitOrDescription(cleanUnit);
  const isSpecial = isSpecialItem || isBobinItem(cleanDesc) || cleanUnit === 'bobin';
  
  if (isSpecial) {
    // If unit is explicitly meter and quantity is meter count (e.g. 500m, 1000m)
    if (hasMeterInUnit && qty >= 500 && qty % 500 === 0) {
      const bobinCount = qty / METERS_PER_BOBIN;
      return {
        parsedQty: Number.isInteger(bobinCount) ? bobinCount : Math.round(bobinCount * 100) / 100,
        parsedUnit: 'Bobin',
        equivalentCoils: qty / METERS_PER_COIL,
        isConverted: true
      };
    }
    // For Bobin items, the quantity is directly the Bobin count
    return {
      parsedQty: qty,
      parsedUnit: 'Bobin',
      equivalentCoils: qty * COILS_PER_BOBIN,
      isConverted: false
    };
  }

  // Standard coil item: 10 coils is simply 10 coils, NOT a special item or bobin
  return {
    parsedQty: qty,
    parsedUnit: unit || (qty === 1 ? 'Coil' : 'Coils'),
    equivalentCoils: qty,
    isConverted: false
  };
}

export interface ItemColorStockLedger {
  opening: { red: number; blk: number; yel: number; grn: number; blu: number; others: number; total: number };
  imported: { red: number; blk: number; yel: number; grn: number; blu: number; others: number; total: number };
  returnParty: { red: number; blk: number; yel: number; grn: number; blu: number; others: number; total: number };
  exchangeIn?: { red: number; blk: number; yel: number; grn: number; blu: number; others: number; total: number };
  sales: { red: number; blk: number; yel: number; grn: number; blu: number; others: number; total: number };
  returnFactory: { red: number; blk: number; yel: number; grn: number; blu: number; others: number; total: number };
  exchangeOut?: { red: number; blk: number; yel: number; grn: number; blu: number; others: number; total: number };
  closing: { red: number; blk: number; yel: number; grn: number; blu: number; others: number; total: number };
}

function cleanBranchStr(name?: string): string {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)/g, '').replace(/Sales Center|Showroom/gi, '').trim().toLowerCase();
}

/**
 * Computes color-wise stock ledger for an item:
 * Opening Color Stock + Factory Import History Colors + Return from Party Colors + Color Exchange In - Sales Bill Colors - Return Factory Colors - Color Exchange Out
 * Optionally filtered by sales center (branchId / branchName).
 * Office bills are strictly excluded so they do not impact sales center color stock.
 */
export function calculateItemColorStockLedger(
  item: Item,
  factoryImports: FactoryImportChallan[] = [],
  storedBills: any[] = [],
  stockReturns: any[] = [],
  branchId?: string,
  deliveryChallans: any[] = [],
  colorExchanges: ColorExchangeChallan[] = [],
  branchName?: string
): ItemColorStockLedger {
  const result: ItemColorStockLedger = {
    opening: { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0, total: 0 },
    imported: { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0, total: 0 },
    returnParty: { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0, total: 0 },
    exchangeIn: { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0, total: 0 },
    sales: { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0, total: 0 },
    returnFactory: { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0, total: 0 },
    exchangeOut: { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0, total: 0 },
    closing: { red: 0, blk: 0, yel: 0, grn: 0, blu: 0, others: 0, total: 0 }
  };

  if (!item) return result;

  const targetId = (branchId || '').toLowerCase().trim();
  const targetName = (branchName || '').toLowerCase().trim();
  const targetClean = cleanBranchStr(branchName || branchId);
  const isBranchFilterActive = Boolean(branchId && branchId !== 'ALL');

  const matchesBranch = (bId?: string, bName?: string) => {
    if (!isBranchFilterActive) return true;
    const bid = (bId || '').toLowerCase().trim();
    const bname = (bName || '').toLowerCase().trim();
    const bclean = cleanBranchStr(bName || bId);

    if (bid && (bid === targetId || bid === targetName || bid === targetClean)) return true;
    if (bname && (bname === targetName || bname === targetId || bname.includes(targetName) || targetName.includes(bname))) return true;
    if (bclean && targetClean && (bclean === targetClean || bclean.includes(targetClean) || targetClean.includes(bclean))) return true;

    if (!bid && !bname && (targetId === 'branch-1' || targetId === 'branch-main' || targetClean.includes('madhupur'))) {
      return true;
    }
    return false;
  };

  // 1. Opening colors from item definition (or branch-specific opening stock)
  const isBranchOpeningApplicable = !isBranchFilterActive || branchId === 'branch-1' || branchId === 'branch-main' || targetClean.includes('madhupur');
  const opColors = item.colorStock || {};
  if (isBranchOpeningApplicable) {
    result.opening.red = Number(opColors.red) || 0;
    result.opening.blk = Number(opColors.blk || opColors.black) || 0;
    result.opening.yel = Number(opColors.yel || opColors.yellow) || 0;
    result.opening.grn = Number(opColors.grn || opColors.green) || 0;
    result.opening.blu = Number(opColors.blu || opColors.blue) || 0;
    result.opening.others = Number(opColors.others) || 0;
    result.opening.total =
      result.opening.red +
      result.opening.blk +
      result.opening.yel +
      result.opening.grn +
      result.opening.blu +
      result.opening.others;

    const generalOpening = getItemOpeningStock(item, branchId, branchName);
    if (result.opening.total === 0 && generalOpening > 0) {
      result.opening.total = generalOpening;
    }
  }

  // 2. Factory Imports
  if (Array.isArray(factoryImports)) {
    factoryImports.forEach((fi) => {
      const fiBranchId = fi.branchId || (fi as any).header?.branchId;
      const fiBranchName = fi.branchName || (fi as any).salesCenter;
      if (!matchesBranch(fiBranchId, fiBranchName)) return;

      if (Array.isArray(fi.lines)) {
        fi.lines.forEach((l) => {
          if (
            (l.itemId && l.itemId === item.id) ||
            (l.itemCode && l.itemCode === item.code) ||
            (l.itemName && l.itemName.trim().toLowerCase() === item.name.trim().toLowerCase())
          ) {
            const lineAny = l as any;
            const r = Number(l.red) || 0;
            const b = Number(l.black || lineAny.blk) || 0;
            const y = Number(l.yellow || lineAny.yel) || 0;
            const g = Number(l.green || lineAny.grn) || 0;
            const bl = Number(l.blue || lineAny.blu) || 0;
            const o = Number(l.others) || 0;
            result.imported.red += r;
            result.imported.blk += b;
            result.imported.yel += y;
            result.imported.grn += g;
            result.imported.blu += bl;
            result.imported.others += o;
            result.imported.total += (r + b + y + g + bl + o > 0 ? (r + b + y + g + bl + o) : Number(l.quantity) || 0);
          }
        });
      }
    });
  }

  // 3. Return from Party & Return Factory from Stock Returns
  if (Array.isArray(stockReturns)) {
    stockReturns.forEach((sr) => {
      const srBranchId = sr.branchId || (sr as any).header?.branchId;
      const srBranchName = sr.branchName || (sr as any).salesCenter;
      if (!matchesBranch(srBranchId, srBranchName)) return;

      const isParty = sr.returnType === 'party_return';
      const targetObj = isParty ? result.returnParty : result.returnFactory;
      if (Array.isArray(sr.lines)) {
        sr.lines.forEach((l: any) => {
          if (
            (l.itemId && l.itemId === item.id) ||
            (l.itemCode && l.itemCode === item.code) ||
            (l.itemName && l.itemName.trim().toLowerCase() === item.name.trim().toLowerCase())
          ) {
            const c = l.colors || {};
            const r = Number(c.red || l.red) || 0;
            const b = Number(c.blk || c.black || l.black) || 0;
            const y = Number(c.yel || c.yellow || l.yellow) || 0;
            const g = Number(c.grn || c.green || l.green) || 0;
            const bl = Number(c.blu || c.blue || l.blue) || 0;
            const o = Number(c.others || l.others) || 0;
            targetObj.red += r;
            targetObj.blk += b;
            targetObj.yel += y;
            targetObj.grn += g;
            targetObj.blu += bl;
            targetObj.others += o;
            targetObj.total += (r + b + y + g + bl + o > 0 ? (r + b + y + g + bl + o) : Number(l.quantity) || 0);
          }
        });
      }
    });
  }

  // 4. Color Exchanges
  if (Array.isArray(colorExchanges)) {
    colorExchanges.forEach((ex) => {
      const exBranchId = ex.branchId || (ex as any).header?.branchId;
      const exBranchName = ex.branchName || (ex as any).salesCenter;
      if (!matchesBranch(exBranchId, exBranchName)) return;

      if (Array.isArray(ex.lines)) {
        ex.lines.forEach((l: any) => {
          // Input Side (+ Return into Showroom)
          const inMatch =
            (l.inItemId && l.inItemId === item.id) ||
            (l.inItemCode && l.inItemCode === item.code) ||
            (l.inItemName && l.inItemName.trim().toLowerCase() === item.name.trim().toLowerCase());
          if (inMatch) {
            const inQty = l.inCoilEquivalent !== undefined ? Number(l.inCoilEquivalent) || 0 : Number(l.inQty) || 0;
            const c = l.inColors || l.colors || {};
            const r = Number(c.red) || 0;
            const b = Number(c.blk || c.black) || 0;
            const y = Number(c.yel || c.yellow) || 0;
            const g = Number(c.grn || c.green) || 0;
            const bl = Number(c.blu || c.blue) || 0;
            const o = Number(c.others) || 0;
            if (r + b + y + g + bl + o > 0) {
              result.exchangeIn!.red += r;
              result.exchangeIn!.blk += b;
              result.exchangeIn!.yel += y;
              result.exchangeIn!.grn += g;
              result.exchangeIn!.blu += bl;
              result.exchangeIn!.others += o;
              result.exchangeIn!.total += (r + b + y + g + bl + o);
            } else if (l.inColor) {
              const col = String(l.inColor).toLowerCase();
              if (col.includes('red')) result.exchangeIn!.red += inQty;
              else if (col.includes('bl')) result.exchangeIn!.blk += inQty;
              else if (col.includes('yel')) result.exchangeIn!.yel += inQty;
              else if (col.includes('grn') || col.includes('green')) result.exchangeIn!.grn += inQty;
              else if (col.includes('blue')) result.exchangeIn!.blu += inQty;
              else result.exchangeIn!.others += inQty;
              result.exchangeIn!.total += inQty;
            } else {
              result.exchangeIn!.others += inQty;
              result.exchangeIn!.total += inQty;
            }
          }

          // Output Side (- Delivered from Showroom)
          const outMatch =
            (l.outItemId && l.outItemId === item.id) ||
            (l.outItemCode && l.outItemCode === item.code) ||
            (l.outItemName && l.outItemName.trim().toLowerCase() === item.name.trim().toLowerCase());
          if (outMatch) {
            const outQty = l.outCoilEquivalent !== undefined ? Number(l.outCoilEquivalent) || 0 : Number(l.outQty) || 0;
            const c = l.outColors || l.colors || {};
            const r = Number(c.red) || 0;
            const b = Number(c.blk || c.black) || 0;
            const y = Number(c.yel || c.yellow) || 0;
            const g = Number(c.grn || c.green) || 0;
            const bl = Number(c.blu || c.blue) || 0;
            const o = Number(c.others) || 0;
            if (r + b + y + g + bl + o > 0) {
              result.exchangeOut!.red += r;
              result.exchangeOut!.blk += b;
              result.exchangeOut!.yel += y;
              result.exchangeOut!.grn += g;
              result.exchangeOut!.blu += bl;
              result.exchangeOut!.others += o;
              result.exchangeOut!.total += (r + b + y + g + bl + o);
            } else if (l.outColor) {
              const col = String(l.outColor).toLowerCase();
              if (col.includes('red')) result.exchangeOut!.red += outQty;
              else if (col.includes('bl')) result.exchangeOut!.blk += outQty;
              else if (col.includes('yel')) result.exchangeOut!.yel += outQty;
              else if (col.includes('grn') || col.includes('green')) result.exchangeOut!.grn += outQty;
              else if (col.includes('blue')) result.exchangeOut!.blu += outQty;
              else result.exchangeOut!.others += outQty;
              result.exchangeOut!.total += outQty;
            } else {
              result.exchangeOut!.others += outQty;
              result.exchangeOut!.total += outQty;
            }
          }
        });
      }
    });
  }

  // 5. Sales Bills
  if (Array.isArray(storedBills)) {
    storedBills.forEach((sb) => {
      if (sb.isDraft || sb.header?.isDraft || sb.status === 'draft') return;
      const isOffice = Boolean(
        sb.isOfficeBill ||
        sb.header?.isOfficeBill ||
        sb.billType === 'office' ||
        sb.header?.billType === 'office' ||
        sb.type === 'office' ||
        sb.header?.type === 'office' ||
        (sb.header?.billTitle && String(sb.header.billTitle).toLowerCase().includes('office'))
      );
      if (isOffice) return;

      const billBranchId = sb.header?.branchId || sb.branchId;
      const billBranchName = sb.header?.branchName || sb.branchName || (sb as any).salesCenter;
      if (!matchesBranch(billBranchId, billBranchName)) return;

      if (Array.isArray(sb.lines)) {
        sb.lines.forEach((l: any) => {
          if (
            (l.itemId && l.itemId === item.id) ||
            (l.itemDescription && l.itemDescription.trim().toLowerCase() === item.name.trim().toLowerCase())
          ) {
            const c = l.colors || {};
            const r = Number(c.red) || 0;
            const b = Number(c.blk || c.black) || 0;
            const y = Number(c.yel || c.yellow) || 0;
            const g = Number(c.grn || c.green) || 0;
            const bl = Number(c.blu || c.blue) || 0;
            const o = Number(c.others) || 0;
            result.sales.red += r;
            result.sales.blk += b;
            result.sales.yel += y;
            result.sales.grn += g;
            result.sales.blu += bl;
            result.sales.others += o;
            result.sales.total += (r + b + y + g + bl + o > 0 ? (r + b + y + g + bl + o) : Number(l.coilQty) || 0);
          }
        });
      }
    });
  }

  // 6. Unbilled Delivery Challans with colors
  if (Array.isArray(deliveryChallans)) {
    deliveryChallans.forEach((ch) => {
      if (ch.isBilled) return;

      const chBranchId = ch.branchId || ch.header?.branchId;
      const chBranchName = ch.branchName || (ch as any).branch || (ch as any).salesCenter;
      if (!matchesBranch(chBranchId, chBranchName)) return;

      if (Array.isArray(ch.lines)) {
        ch.lines.forEach((l: any) => {
          if (
            (l.itemId && l.itemId === item.id) ||
            (l.itemDescription && l.itemDescription.trim().toLowerCase() === item.name.trim().toLowerCase()) ||
            (l.itemName && l.itemName.trim().toLowerCase() === item.name.trim().toLowerCase()) ||
            (l.itemCode && l.itemCode === item.code)
          ) {
            const unbilledQty = l.dueQty !== undefined
              ? Number(l.dueQty) || 0
              : Math.max(0, (Number(l.coilQty) || 0) - (Number(l.billedQty) || 0));

            if (unbilledQty <= 0) return;

            const c = l.colors || {};
            const r = Number(c.red) || 0;
            const b = Number(c.blk || c.black) || 0;
            const y = Number(c.yel || c.yellow) || 0;
            const g = Number(c.grn || c.green) || 0;
            const bl = Number(c.blu || c.blue) || 0;
            const o = Number(c.others) || 0;
            result.sales.red += r;
            result.sales.blk += b;
            result.sales.yel += y;
            result.sales.grn += g;
            result.sales.blu += bl;
            result.sales.others += o;
            result.sales.total += (r + b + y + g + bl + o > 0 ? (r + b + y + g + bl + o) : unbilledQty);
          }
        });
      }
    });
  }

  // 7. Compute Closing Color Breakdown: Opening + Imported + ReturnParty + ExchangeIn - Sales - ReturnFactory - ExchangeOut
  const exIn = result.exchangeIn!;
  const exOut = result.exchangeOut!;
  result.closing.red = result.opening.red + result.imported.red + result.returnParty.red + exIn.red - result.sales.red - result.returnFactory.red - exOut.red;
  result.closing.blk = result.opening.blk + result.imported.blk + result.returnParty.blk + exIn.blk - result.sales.blk - result.returnFactory.blk - exOut.blk;
  result.closing.yel = result.opening.yel + result.imported.yel + result.returnParty.yel + exIn.yel - result.sales.yel - result.returnFactory.yel - exOut.yel;
  result.closing.grn = result.opening.grn + result.imported.grn + result.returnParty.grn + exIn.grn - result.sales.grn - result.returnFactory.grn - exOut.grn;
  result.closing.blu = result.opening.blu + result.imported.blu + result.returnParty.blu + exIn.blu - result.sales.blu - result.returnFactory.blu - exOut.blu;
  result.closing.others = result.opening.others + result.imported.others + result.returnParty.others + exIn.others - result.sales.others - result.returnFactory.others - exOut.others;
  result.closing.total = result.closing.red + result.closing.blk + result.closing.yel + result.closing.grn + result.closing.blu + result.closing.others;

  return result;
}

/**
 * Automatically synchronizes rates for all special items when base item rates change.
 * If a special item is linked to a base item (via baseItemId, baseItemCode, or code prefix/name matching),
 * its rate is automatically calculated from the base item's new rate using calculateSpecialItemRate.
 */
export function syncSpecialItemRatesWithBaseItems(itemsList: Item[]): Item[] {
  if (!Array.isArray(itemsList) || itemsList.length === 0) return itemsList;

  // Build a lookup map of base items (non-special items) by id, code, and normalized name
  const baseItemsById = new Map<string, Item>();
  const baseItemsByCode = new Map<string, Item>();
  const baseItemsByName = new Map<string, Item>();

  itemsList.forEach((it) => {
    if (!it.isSpecialItem) {
      if (it.id) baseItemsById.set(String(it.id), it);
      if (it.code) baseItemsByCode.set(String(it.code).trim().toUpperCase(), it);
      if (it.name) baseItemsByName.set(String(it.name).trim().toLowerCase(), it);
    }
  });

  let hasChanges = false;
  const updatedList = itemsList.map((item) => {
    if (!item.isSpecialItem) return item;

    // Find linked base item
    let baseItem: Item | undefined;
    if (item.baseItemId && baseItemsById.has(String(item.baseItemId))) {
      baseItem = baseItemsById.get(String(item.baseItemId));
    } else if (item.baseItemCode && baseItemsByCode.has(String(item.baseItemCode).trim().toUpperCase())) {
      baseItem = baseItemsByCode.get(String(item.baseItemCode).trim().toUpperCase());
    } else if (item.code) {
      // e.g. PC-102-S500 -> base PC-102
      const candidateCode = String(item.code).replace(/-(?:S\d+|CAT6-\d+|\d+M)$/i, '').trim().toUpperCase();
      if (candidateCode && baseItemsByCode.has(candidateCode)) {
        baseItem = baseItemsByCode.get(candidateCode);
      }
    }

    if (!baseItem && item.name) {
      // Try finding base item from name by stripping special tags
      const cleanName = String(item.name).replace(/\s*\([^)]*(?:500\s*m|length|mtr|meter)[^)]*\)/gi, '').trim().toLowerCase();
      if (baseItemsByName.has(cleanName)) {
        baseItem = baseItemsByName.get(cleanName);
      } else {
        // Find partial name match
        for (const [bName, bItem] of baseItemsByName.entries()) {
          if (cleanName.includes(bName) || bName.includes(cleanName)) {
            baseItem = bItem;
            break;
          }
        }
      }
    }

    if (!baseItem || typeof baseItem.rate !== 'number' || baseItem.rate <= 0) {
      return item;
    }

    // Determine deduct multiplier (meters or coils)
    const multiplier = Number(item.stockMultiplier) || 5;
    const isMeter = /meters?|mtrs?|^m$/i.test((item.unit || '').trim());
    let deductValue = multiplier;
    if (isMeter && multiplier <= 20) {
      deductValue = multiplier * 100;
    }

    const calculatedRate = calculateSpecialItemRate(baseItem.rate, deductValue, item.unit);
    if (calculatedRate > 0 && calculatedRate !== item.rate) {
      hasChanges = true;
      return {
        ...item,
        rate: calculatedRate,
        baseRate: baseItem.rate,
        baseItemId: baseItem.id,
        baseItemCode: baseItem.code
      };
    }

    return item;
  });

  return hasChanges ? updatedList : itemsList;
}

/**
 * Accurately resolves the linked base stock item for a given special item.
 * Prioritizes code matching (e.g. PC-102-S500 -> PC-102) and name core matching over stale/corrupted IDs
 * to prevent showing the wrong base stock item name.
 */
export function resolveBaseItemForSpecialItem(
  specialItem: Item,
  standardItemsList: Item[]
): Item | undefined {
  if (!specialItem || !Array.isArray(standardItemsList) || standardItemsList.length === 0) {
    return undefined;
  }

  // 1. Explicit CAT-6 matching rule: Special CAT-6 items must strictly link to CAT-6 base item
  const isSpecialCat6 = (specialItem.code || '').toUpperCase().includes('CAT6') || (specialItem.name || '').toUpperCase().includes('CAT-6') || (specialItem.name || '').toUpperCase().includes('CAT6');
  if (isSpecialCat6) {
    const cat6Base = standardItemsList.find(
      (i) =>
        (i.id === 'item-57-cat6' || (i.code && i.code.toUpperCase().includes('CAT6')) || (i.name && i.name.toUpperCase().includes('CAT-6') && !i.isSpecialItem)) &&
        !i.isSpecialItem
    );
    if (cat6Base) return cat6Base;
  }

  // 2. Direct Code pattern match: e.g. PC-102-S500 -> PC-102, PC-103-S500 -> PC-103, PC-105-S500 -> PC-105
  // This is the most accurate ground truth for Poly Cables ERP items
  if (specialItem.code) {
    const candidateCode = specialItem.code
      .replace(/-(?:S\d+|\d+M|\d+)$/i, '')
      .trim()
      .toUpperCase();
    if (candidateCode && candidateCode !== specialItem.code.trim().toUpperCase()) {
      const byCode = standardItemsList.find(
        (i) => i.code && i.code.trim().toUpperCase() === candidateCode && !i.isSpecialItem
      );
      if (byCode) return byCode;
    }
  }

  // 3. Name-based spec matching (e.g. "1.3 Rm", "1.5 Rm", "1.0 Rm") to prevent mismatched IDs
  const specRegex = /(\d+(?:\.\d+)?\s*(?:rm|re|bya|byfy))/i;
  const specialNameMatch = (specialItem.name || '').toLowerCase().match(specRegex);
  if (specialNameMatch) {
    const targetSpec = specialNameMatch[1].replace(/\s+/g, '').toLowerCase();
    const bySpec = standardItemsList.find((i) => {
      if (i.isSpecialItem || !i.name) return false;
      const m = i.name.toLowerCase().match(specRegex);
      return m && m[1].replace(/\s+/g, '').toLowerCase() === targetSpec;
    });
    if (bySpec) return bySpec;
  }

  // 4. Explicit baseItemId match (verified against candidateCode / spec)
  if (specialItem.baseItemId) {
    const targetId = String(specialItem.baseItemId).trim().toLowerCase();
    if (!(isSpecialCat6 && (targetId === 'item-57' || targetId === 'pc-157'))) {
      const byId = standardItemsList.find(
        (i) =>
          (i.id && String(i.id).trim().toLowerCase() === targetId) ||
          (i.code && i.code.trim().toLowerCase() === targetId) ||
          (i.name && i.name.trim().toLowerCase() === targetId)
      );
      if (byId) return byId;
    }
  }

  // 5. Explicit baseItemCode match
  if (specialItem.baseItemCode) {
    const targetCode = specialItem.baseItemCode.trim().toLowerCase();
    if (!(isSpecialCat6 && (targetCode === 'pc-157' || targetCode === 'item-57'))) {
      const byBaseCode = standardItemsList.find(
        (i) =>
          (i.code && i.code.trim().toLowerCase() === targetCode) ||
          (i.id && String(i.id).trim().toLowerCase() === targetCode) ||
          (i.name && i.name.trim().toLowerCase() === targetCode)
      );
      if (byBaseCode) return byBaseCode;
    }
  }

  // 4. Name-based match by stripping length, coil, and meter tags
  const cleanName = (specialItem.name || '')
    .replace(/\s*\([^)]*(?:500\s*m|305\s*m|length|mtr|meter|bobin)[^)]*\)/gi, '')
    .replace(/\s*-\s*\d+\s*coils?/gi, '')
    .trim()
    .toLowerCase();

  if (cleanName) {
    // 4a. Exact name match within the same category first
    const cat = (specialItem.category || '').trim().toLowerCase();
    if (cat) {
      const exactInCat = standardItemsList.find(
        (i) =>
          (i.category || '').trim().toLowerCase() === cat &&
          i.name &&
          i.name.trim().toLowerCase() === cleanName
      );
      if (exactInCat) return exactInCat;
    }

    // 4b. Exact name match across all standard items
    const exactNameMatch = standardItemsList.find(
      (i) => i.name && i.name.trim().toLowerCase() === cleanName
    );
    if (exactNameMatch) return exactNameMatch;

    // 4c. Extract cable dimension spec (e.g. "1 x 1.5 rm", "2 x 2.5 re") to prevent 1 X 10 Rm colliding with 1 X 1.0 Rm
    const specRegex = /(\d+\s*(?:x|\*|\/)\s*\d+(?:\.\d+)?\s*(?:rm|re|sq|mm)?)/i;
    const specialSpecMatch = cleanName.match(specRegex);
    if (specialSpecMatch) {
      const specNorm = specialSpecMatch[1].replace(/\s+/g, '').toLowerCase();
      const matchedBySpecAndCat = standardItemsList.find((i) => {
        if (!i.name) return false;
        const iSpec = i.name.toLowerCase().match(specRegex);
        if (!iSpec) return false;
        const norm = iSpec[1].replace(/\s+/g, '').toLowerCase();
        if (norm !== specNorm) return false;
        if (cat) {
          const iCat = (i.category || '').trim().toLowerCase();
          return iCat === cat || iCat.includes(cat) || cat.includes(iCat);
        }
        return true;
      });
      if (matchedBySpecAndCat) return matchedBySpecAndCat;
    }
  }

  return undefined;
}

export function formatChallanLineColors(line: any): string {
  if (!line) return '-';
  const c = line.colors;
  if (c && typeof c === 'object') {
    const parts: string[] = [];
    const red = Number(c.red) || 0;
    const blk = Number(c.blk ?? c.black) || 0;
    const yel = Number(c.yel ?? c.yellow) || 0;
    const grn = Number(c.grn ?? c.green) || 0;
    const blu = Number(c.blu ?? c.blue) || 0;
    const wht = Number(c.wht ?? c.white) || 0;
    const others = Number(c.others ?? c.other) || 0;

    if (red > 0) parts.push(`Red: ${red}`);
    if (blk > 0) parts.push(`Black: ${blk}`);
    if (yel > 0) parts.push(`Yellow: ${yel}`);
    if (grn > 0) parts.push(`Green: ${grn}`);
    if (blu > 0) parts.push(`Blue: ${blu}`);
    if (wht > 0) parts.push(`White: ${wht}`);
    if (others > 0) parts.push(`Other: ${others}`);

    if (parts.length > 0) return parts.join(', ');
  }

  if (typeof line.color === 'string' && line.color.trim()) {
    return line.color.trim();
  }
  if (typeof line.sizeSpec === 'string' && line.sizeSpec.trim()) {
    const s = line.sizeSpec.trim();
    if (s.includes(':') || s.toLowerCase().includes('red') || s.toLowerCase().includes('black') || s.toLowerCase().includes('blue')) {
      return s;
    }
  }
  return '-';
}



