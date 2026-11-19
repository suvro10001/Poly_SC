import * as XLSX from 'xlsx';
import { BillHeader, BillLineItem } from '../types';
import { parseSpecialMeterAndQtyToBobin, isBobinItem, isMeterUnitOrDescription } from './stockHelper';

export interface FastParsedChallanData {
  header: Partial<BillHeader>;
  lines: Array<{
    slNo: number;
    itemDescription: string;
    sizeSpec?: string;
    coilQty: number;
    unit?: string;
    rate: number;
    amount: number;
    missingQty?: boolean;
  }>;
  totalCoils: number;
  totalAmount: number;
  hasPrices: boolean;
  missingPriceCount: number;
  isRecognizedTable: boolean;
}

/**
 * Normalizes text for matching column headers (preserves alphanumeric and Bengali unicode characters).
 */
function cleanColName(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a string contains typical cable specification or item indicators.
 */
function looksLikeCableItem(text: string): boolean {
  if (!text || text.length < 2) return false;
  const t = text.toLowerCase();
  return (
    /\d+\s*[\/xX]\s*[\d.]+/i.test(t) ||
    /\b\d+(?:\.\d+)?\s*(?:rm|sm|re|mm|sqmm|core|c)\b/i.test(t) ||
    /\b(bym|bya|bys|nyy|rm|sm|re|core|coils?|meter|mtr|bobin|duplex|drop\s*wire|submersible|coaxial|cat\s*6|frl?s?|flexible|copper|aluminium|twin|flat|wire|cable|strand|pvc|power|control)\b/i.test(t) ||
    /ক্যাবল|তার|কয়েল|ববিন|মিটার/i.test(t)
  );
}
export interface ChallanParseOptions {
  knownParties?: any[];
  knownItems?: any[];
}

/**
 * Fast client-side extractor for Excel (.xlsx, .xls) and CSV challan/bill documents.
 * Completes parsing directly in browser memory without requiring external API keys.
 */
export async function fastParseExcelChallan(
  file: File,
  options?: ChallanParseOptions
): Promise<FastParsedChallanData | null> {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return null;
    }

    const knownParties = options?.knownParties || [];
    const knownItems = options?.knownItems || [];
    let bestParsedResult: FastParsedChallanData | null = null;

    // Try each sheet to find the one containing the best bill/challan item rows
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;

      const rawMatrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rawMatrix || rawMatrix.length === 0) continue;

      const header: Partial<BillHeader> = {};
      let tableHeaderRowIdx = -1;
      let firstDataRowIdx = -1;
      let colDescIdx = -1;
      let colQtyIdx = -1;
      let colUnitIdx = -1;
      let colRateIdx = -1;
      let colAmtIdx = -1;
      let colSizeIdx = -1;
      let colSlIdx = -1;

      // 1. First pass: Match cells against known customer parties in system
      if (knownParties.length > 0 && !header.partyName) {
        for (let r = 0; r < Math.min(rawMatrix.length, 35); r++) {
          const row = rawMatrix[r];
          if (!Array.isArray(row)) continue;
          for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c] || '').trim();
            if (cellVal.length < 3) continue;
            const cellValClean = cellVal.toLowerCase().replace(/^(?:m\/s\.?|messrs\.?|মেসার্স)\s*/i, '').replace(/[^a-z0-9\u0980-\u09FF]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!cellValClean) continue;

            const matchedParty = knownParties.find((p: any) => {
              const pName = String(p.name || p).trim();
              const pClean = pName.toLowerCase().replace(/^(?:m\/s\.?|messrs\.?|মেসার্স)\s*/i, '').replace(/[^a-z0-9\u0980-\u09FF]/g, ' ').replace(/\s+/g, ' ').trim();
              return pClean === cellValClean || cellValClean.includes(pClean) || pClean.includes(cellValClean);
            });

            if (matchedParty) {
              header.partyName = matchedParty.name || matchedParty;
              if (matchedParty.address && !header.address) header.address = matchedParty.address;
              if (matchedParty.phone && !header.phone) header.phone = matchedParty.phone;
              if (matchedParty.salesmanCode && !header.salesmanCode) header.salesmanCode = matchedParty.salesmanCode;
              break;
            }
          }
          if (header.partyName) break;
        }
      }

      // 2. Scan rows to extract header metadata and locate the table headers row
      for (let r = 0; r < Math.min(rawMatrix.length, 35); r++) {
        const row = rawMatrix[r];
        if (!Array.isArray(row)) continue;

        const rowStr = row.map((c) => String(c || '').trim()).join(' ');
        const rowLower = rowStr.toLowerCase();

        // Check for party name (English & Bengali)
        if (!header.partyName) {
          const partyMatch = rowStr.match(/(?:m\/s\.?|messrs\.?|party\s*name[:\s]*|customer[:\s]*|sold\s*to[:\s]*|buyer[:\s]*|মেসার্স|পার্টি[:\s]*|গ্রাহক[:\s]*)\s*([^,;\n\r|]+)/i);
          if (partyMatch && partyMatch[1]?.trim()) {
            const val = partyMatch[1].trim().replace(/^[:\s-]+/, '');
            if (val.length >= 2 && !/^(address|challan|bill|date|phone|ঠিকানা|তারিখ)/i.test(val)) {
              header.partyName = val;
            }
          }
        }

        // Check for Challan No
        if (!header.challanNo) {
          const chMatch = rowStr.match(/(?:challan\s*no\.?|challan\s*#|d\.?c\.?\s*no\.?|challan[:\s]*|dc\s*#|চালান\s*নং?|চালান[:\s]*)\s*([A-Za-z0-9\/-]+)/i);
          if (chMatch && chMatch[1]?.trim()) {
            header.challanNo = chMatch[1].trim().replace(/^[:\s-]+/, '');
          }
        }

        // Check for Bill No
        if (!header.billNo) {
          const billMatch = rowStr.match(/(?:bill\s*no\.?|invoice\s*no\.?|bill\s*#|inv\s*#|বিল\s*নং?|ইনভয়েস[:\s]*)\s*([A-Za-z0-9\/-]+)/i);
          if (billMatch && billMatch[1]?.trim()) {
            header.billNo = billMatch[1].trim().replace(/^[:\s-]+/, '');
          }
        }

        // Check for Date
        if (!header.date) {
          const dateMatch = rowStr.match(/(?:date|dated|তারিখ)[:\s]*(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
          if (dateMatch && dateMatch[1]?.trim()) {
            const dStr = dateMatch[1].trim();
            header.date = dStr;
            header.challanDate = dStr;
          } else if (rowLower.includes('date') || rowLower.includes('তারিখ')) {
            for (const cell of row) {
              const num = Number(cell);
              if (!isNaN(num) && num >= 35000 && num <= 65000) {
                const jsDate = new Date(Math.round((num - 25569) * 86400 * 1000));
                if (!isNaN(jsDate.getTime())) {
                  const yyyy = jsDate.getUTCFullYear();
                  const mm = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
                  const dd = String(jsDate.getUTCDate()).padStart(2, '0');
                  const formatted = `${yyyy}-${mm}-${dd}`;
                  header.date = formatted;
                  header.challanDate = formatted;
                  break;
                }
              }
            }
          }
        }

        // Check for Address
        if (!header.address) {
          const addrMatch = rowStr.match(/(?:address|destination|place\s*of\s*delivery|location|ঠিকানা|গন্তব্য)[:\s]*([^,;\n\r|]+)/i);
          if (addrMatch && addrMatch[1]?.trim()) {
            header.address = addrMatch[1].trim().replace(/^[:\s-]+/, '');
          }
        }

        // Check for Order No
        if (!header.orderNumber) {
          const orderMatch = rowStr.match(/(?:order\s*no\.?|order\s*#|req\s*no\.?|p\.?o\.?\s*#?|অর্ডার\s*নং?)\s*([A-Za-z0-9\/-]+)/i);
          if (orderMatch && orderMatch[1]?.trim()) {
            header.orderNumber = orderMatch[1].trim().replace(/^[:\s-]+/, '');
          }
        }

        // 2. Identify Table Header Columns
        let foundDesc = -1;
        let foundQty = -1;
        let foundRate = -1;
        let foundAmt = -1;
        let foundUnit = -1;
        let foundSize = -1;
        let foundSl = -1;

        for (let c = 0; c < row.length; c++) {
          const colText = cleanColName(row[c]);
          if (!colText) continue;

          // Item Description / Goods identification
          if (
            colText.includes('description') ||
            colText.includes('goods') ||
            colText.includes('particular') ||
            colText.includes('item name') ||
            colText.includes('name of item') ||
            colText.includes('name of items') ||
            colText.includes('name & description') ||
            colText.includes('name of goods') ||
            colText.includes('product') ||
            colText.includes('cable size') ||
            colText.includes('items') ||
            colText.includes('item') ||
            colText.includes('details') ||
            colText.includes('specification') ||
            colText.includes('বিবরণ') ||
            colText.includes('মালের বিবরণ') ||
            colText.includes('পণ্যের বিবরণ') ||
            colText.includes('পণ্যের নাম') ||
            colText.includes('আইটেম') ||
            colText.includes('পণ্য')
          ) {
            // Ensure cell is not an entire sentence or narrative terms row
            if (colText.length <= 60 && !colText.includes('once sold') && !colText.includes('received in')) {
              foundDesc = c;
            }
          } else if (
            colText.includes('qty') ||
            colText.includes('quantity') ||
            colText.includes('coil') ||
            colText.includes('coils') ||
            colText.includes('pcs') ||
            colText.includes('count') ||
            colText.includes('delivered qty') ||
            colText.includes('challan qty') ||
            colText.includes('order qty') ||
            colText.includes('bill qty') ||
            colText.includes('পরিমাণ') ||
            colText.includes('কয়েল') ||
            colText.includes('সংখ্যা') ||
            colText.includes('পিস')
          ) {
            foundQty = c;
          } else if (
            colText.includes('rate') ||
            colText.includes('price') ||
            colText.includes('unit price') ||
            colText.includes('unit rate') ||
            colText.includes('দর') ||
            colText.includes('মূল্য') ||
            colText.includes('রেট')
          ) {
            foundRate = c;
          } else if (
            colText.includes('amount') ||
            colText.includes('total') ||
            colText.includes('taka') ||
            colText.includes('val') ||
            colText.includes('টাকা') ||
            colText.includes('মোট টাকা')
          ) {
            if (foundAmt === -1 && !colText.includes('total qty') && !colText.includes('total coil') && !colText.includes('মোট কয়েল')) {
              foundAmt = c;
            }
          } else if (colText.includes('unit') || colText.includes('uom') || colText.includes('একক')) {
            foundUnit = c;
          } else if (colText.includes('size') || colText.includes('spec') || colText.includes('dimension') || colText.includes('সাইজ')) {
            foundSize = c;
          } else if (colText === 'sl' || colText === 'sl no' || colText === 'no' || colText === '#' || colText.includes('ক্রমিক') || colText.includes('নং')) {
            foundSl = c;
          }
        }

        // A true table header row must have Description/Goods AND at least one other line item column (Quantity, Rate, Amount, Unit, or SL No)
        const hasLineColumn = foundQty !== -1 || foundRate !== -1 || foundAmt !== -1 || foundUnit !== -1 || (foundSl !== -1 && row.length >= 3);
        if (foundDesc !== -1 && hasLineColumn) {
          tableHeaderRowIdx = r;
          colDescIdx = foundDesc;
          colQtyIdx = foundQty;
          colRateIdx = foundRate;
          colAmtIdx = foundAmt;
          colUnitIdx = foundUnit;
          colSizeIdx = foundSize;
          colSlIdx = foundSl;
          break;
        }
      }

      // If no explicit table header row was recognized, scan rows for cable item patterns
      if (tableHeaderRowIdx === -1) {
        for (let r = 0; r < Math.min(rawMatrix.length, 30); r++) {
          const row = rawMatrix[r];
          if (!Array.isArray(row) || row.length < 1) continue;

          // Check if any column in this row looks like a cable item
          for (let c = 0; c < Math.min(row.length, 4); c++) {
            const cellText = String(row[c] || '').trim();
            if (looksLikeCableItem(cellText)) {
              firstDataRowIdx = r;
              colDescIdx = c;
              // Find adjacent numerical columns for Qty, Rate, Amount
              for (let nc = c + 1; nc < row.length; nc++) {
                const cellVal = String(row[nc] || '').trim();
                if (/^(coils?|pcs|meters?|bobin|mtr|ববিন|কয়েল|পিস)$/i.test(cellVal)) {
                  if (colUnitIdx === -1) colUnitIdx = nc;
                  continue;
                }
                const num = Number(cellVal.replace(/[^0-9.]/g, ''));
                if (!isNaN(num) && num > 0) {
                  if (colQtyIdx === -1) {
                    colQtyIdx = nc;
                  } else if (colRateIdx === -1) {
                    colRateIdx = nc;
                  } else if (colAmtIdx === -1) {
                    colAmtIdx = nc;
                    break;
                  }
                }
              }
              break;
            }
          }
          if (colDescIdx !== -1) break;
        }
      }

      // If still not identified, attempt column guessing from first 25 rows
      if (tableHeaderRowIdx === -1 && colDescIdx === -1) {
        for (let r = 0; r < Math.min(rawMatrix.length, 25); r++) {
          const row = rawMatrix[r];
          if (!Array.isArray(row) || row.length < 1) continue;
          const text0 = String(row[0] || '').trim();
          const text1 = row.length > 1 ? String(row[1] || '').trim() : '';
          const num1 = row.length > 1 ? Number(String(row[1] || '').replace(/[^0-9.]/g, '')) : NaN;
          const num2 = row.length > 2 ? Number(String(row[2] || '').replace(/[^0-9.]/g, '')) : NaN;

          // Exclude header rows like "Address", "Date"
          const isMeta0 = /^(address|date|phone|voucher|challan|bill|invoice|party|customer|ঠিকানা|তারিখ)/i.test(text0);
          const isMeta1 = /^(address|date|phone|voucher|challan|bill|invoice|party|customer|ঠিকানা|তারিখ)/i.test(text1);

          if (row.length === 1 && text0 && !isMeta0 && isNaN(Number(text0)) && text0.length >= 2) {
            firstDataRowIdx = r;
            colDescIdx = 0;
            break;
          } else if (text0 && !isMeta0 && isNaN(Number(text0)) && text0.length > 2 && (!isNaN(num1) && num1 > 0 || row.length <= 2)) {
            firstDataRowIdx = r;
            colDescIdx = 0;
            colQtyIdx = !isNaN(num1) && num1 > 0 ? 1 : -1;
            colRateIdx = row.length > 2 && !isNaN(num2) ? 2 : -1;
            colAmtIdx = row.length > 3 ? 3 : -1;
            break;
          } else if (text1 && !isMeta1 && isNaN(Number(text1)) && text1.length > 2 && (!isNaN(num2) && num2 > 0 || !isNaN(Number(text0)))) {
            firstDataRowIdx = r;
            colSlIdx = 0;
            colDescIdx = 1;
            colQtyIdx = row.length > 2 ? 2 : -1;
            colRateIdx = row.length > 3 ? 3 : -1;
            colAmtIdx = row.length > 4 ? 4 : -1;
            break;
          }
        }
      }

      if (colDescIdx === -1) {
        continue; // Try next sheet if this sheet has no description column
      }

      const startDataRow = tableHeaderRowIdx !== -1 ? tableHeaderRowIdx + 1 : (firstDataRowIdx !== -1 ? firstDataRowIdx : 0);
      const parsedLines: any[] = [];
      let missingPriceCount = 0;
      let hasAnyPrice = false;

      for (let r = startDataRow; r < rawMatrix.length; r++) {
        const row = rawMatrix[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        let desc = String(row[colDescIdx] || '').trim();

        // Support merged cells across colDescIdx and colDescIdx + 1
        if (!desc || (!isNaN(Number(desc)) && !looksLikeCableItem(desc))) {
          if (colDescIdx + 1 < row.length && colDescIdx + 1 !== colQtyIdx && colDescIdx + 1 !== colRateIdx && colDescIdx + 1 !== colAmtIdx && colDescIdx + 1 !== colUnitIdx) {
            const nextVal = String(row[colDescIdx + 1] || '').trim();
            if (nextVal && isNaN(Number(nextVal))) {
              desc = nextVal;
            }
          }
        } else if (colDescIdx + 1 < row.length && colDescIdx + 1 !== colQtyIdx && colDescIdx + 1 !== colRateIdx && colDescIdx + 1 !== colAmtIdx && colDescIdx + 1 !== colUnitIdx) {
          const nextVal = String(row[colDescIdx + 1] || '').trim();
          if (nextVal && isNaN(Number(nextVal)) && !looksLikeCableItem(desc) && (looksLikeCableItem(nextVal) || /^(bya|bym|bys|nyy|cable|wire|coils?|meter)$/i.test(nextVal))) {
            desc = `${desc} ${nextVal}`.trim();
          }
        }

        if (!desc) {
          // Try other text columns if desc is empty
          for (let c = 0; c < row.length; c++) {
            if (c === colQtyIdx || c === colRateIdx || c === colAmtIdx || c === colUnitIdx || c === colSlIdx) continue;
            const val = String(row[c] || '').trim();
            if (val && isNaN(Number(val)) && val.length > 1) {
              desc = val;
              break;
            }
          }
        }

        if (!desc) continue;

        // Clean prefix like "Item Description / Goods: 1x1.5 Rm"
        desc = desc.replace(/^(?:item\s*description\s*(?:\/|\&)?\s*goods|description\s*of\s*goods|item\s*description|description|goods|particulars|মালের\s*বিবরণ|পণ্যের\s*বিবরণ)[:\s-]+/i, '').trim();
        if (!desc) continue;

        const descLower = desc.toLowerCase().trim();
        // Skip header repetition or summary rows
        if (
          descLower === 'description of goods' ||
          descLower === 'item description / goods' ||
          descLower === 'item description goods' ||
          descLower === 'item description' ||
          descLower === 'description' ||
          descLower === 'goods' ||
          descLower === 'particulars' ||
          descLower === 'particular' ||
          descLower === 'item name' ||
          descLower === 'name of item' ||
          descLower === 'name & description of goods' ||
          descLower === 'মালের বিবরণ' ||
          descLower === 'পণ্যের বিবরণ' ||
          descLower === 'আইটেম' ||
          descLower.startsWith('total ') ||
          descLower === 'total' ||
          descLower.includes('subtotal') ||
          descLower.includes('grand total') ||
          descLower.includes('in words') ||
          descLower.includes('prepared by') ||
          descLower.includes('authorized') ||
          descLower.includes('received by') ||
          descLower.includes('signature') ||
          descLower.includes('স্বাক্ষর') ||
          descLower.includes('কথায়')
        ) {
          continue;
        }

        // Quantity extraction
        let qty = 0;
        if (colQtyIdx !== -1 && row[colQtyIdx] !== undefined) {
          qty = Number(String(row[colQtyIdx]).replace(/[^0-9.]/g, '')) || 0;
        }

        // If quantity was not in the designated column, search row numbers
        if (qty === 0) {
          for (let c = 0; c < row.length; c++) {
            if (c === colDescIdx || c === colSlIdx) continue;
            const val = Number(String(row[c] || '').replace(/[^0-9.]/g, ''));
            if (!isNaN(val) && val > 0 && val < 50000) {
              qty = val;
              break;
            }
          }
        }

        // If quantity is in description string (e.g. "2x1.5 BYM - 10 coils")
        if (qty === 0) {
          const matchQty = desc.match(/(?:-|\s+|,|\()?(?:qty|quantity|coils?|pcs|box|nos|কয়েল)?[:\s]*(\d+)\s*(?:coils?|pcs|box|nos|কয়েল)?\)?$/i);
          if (matchQty && matchQty[1]) {
            const num = parseInt(matchQty[1], 10);
            if (num > 0) {
              qty = num;
              desc = desc.replace(matchQty[0], '').trim();
            }
          }
        }

        let missingQty = false;
        if (qty <= 0) {
          const isMetadataLine =
            /^(?:m\/s\.?|messrs\.?|party\s*name|customer|sold\s*to|buyer|address|destination|location|phone|mobile|cell|challan\s*no|bill\s*no|invoice\s*no|order\s*no|req\s*no|date|dated|remarks|note|vehicle|car\s*no|driver|sales\s*center|showroom|মেসার্স|পার্টি|গ্রাহক|ঠিকানা|তারিখ|চালান|বিল)/i.test(desc) ||
            /^(?:item\s*name|name\s*of\s*items?|items?|product\s*name|sl\.?\s*no\.?)$/i.test(desc);
          if (isMetadataLine) {
            continue;
          }
          const matchesCatalog = knownItems.some((it: any) => {
            const itName = String(it.name || it.itemDescription || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cDesc = descLower.replace(/[^a-z0-9]/g, '');
            return cDesc.length >= 3 && (itName === cDesc || itName.includes(cDesc) || cDesc.includes(itName));
          });
          if (tableHeaderRowIdx !== -1 || looksLikeCableItem(desc) || matchesCatalog || (row.length <= 3 && !desc.includes(':'))) {
            missingQty = true;
            qty = 1;
          } else {
            continue;
          }
        }

        // Unit and meter/Bobin detection & auto-calculation
        let rawUnit = 'Coils';
        if (colUnitIdx !== -1 && row[colUnitIdx]) {
          const uText = String(row[colUnitIdx]).trim();
          if (uText) rawUnit = uText;
        }

        // Parse meter and auto calculate Bobin quantity
        const { parsedQty, parsedUnit } = parseSpecialMeterAndQtyToBobin(
          desc,
          qty,
          rawUnit,
          isBobinItem(desc) || isMeterUnitOrDescription(rawUnit)
        );

        const finalQty = parsedQty;
        const finalUnit = parsedUnit;

        // Rate extraction
        let rate = 0;
        if (colRateIdx !== -1 && row[colRateIdx] !== undefined) {
          rate = Number(String(row[colRateIdx]).replace(/[^0-9.]/g, '')) || 0;
        }

        // Amount extraction
        let amount = 0;
        if (colAmtIdx !== -1 && row[colAmtIdx] !== undefined) {
          amount = Number(String(row[colAmtIdx]).replace(/[^0-9.]/g, '')) || 0;
        }

        if (rate > 0 && amount === 0) {
          amount = Math.round(finalQty * rate);
        } else if (rate === 0 && amount > 0 && finalQty > 0) {
          rate = Number((amount / finalQty).toFixed(2));
        } else if (rate === 0 && amount === 0 && knownItems.length > 0) {
          const cleanDesc = desc.toLowerCase().replace(/[^a-z0-9]/g, '');
          const matchedItem = knownItems.find((it: any) => {
            const itName = String(it.name || it.itemDescription || it.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return itName === cleanDesc || (cleanDesc.length > 3 && (itName.includes(cleanDesc) || cleanDesc.includes(itName)));
          });
          if (matchedItem && matchedItem.rate && matchedItem.rate > 0) {
            rate = matchedItem.rate;
            amount = Math.round(finalQty * rate);
          }
        }

        if (rate > 0) {
          hasAnyPrice = true;
        } else {
          missingPriceCount++;
        }

        const sizeSpec = colSizeIdx !== -1 && row[colSizeIdx] ? String(row[colSizeIdx]).trim() : '';

        parsedLines.push({
          slNo: parsedLines.length + 1,
          itemDescription: desc,
          itemName: desc,
          goods: desc,
          description: desc,
          particulars: desc,
          sizeSpec,
          coilQty: finalQty,
          unit: finalUnit,
          rate,
          amount,
          missingQty
        });
      }

      if (parsedLines.length > 0) {
        const totalCoils = parsedLines.reduce((s, l) => {
          if (l.unit && /^bobin$/i.test(l.unit.trim())) {
            return s + (l.coilQty || 0) * 5;
          }
          return s + (l.coilQty || 0);
        }, 0);
        const totalAmount = parsedLines.reduce((s, l) => s + (l.amount || 0), 0);

        // Scan sheet for discount (percentage or amount e.g. "Less Discount 10%", "Discount: 15%", "কমিশন")
        let foundDiscountPercent = 0;
        let foundDiscountAmount = 0;
        for (let r = 0; r < rawMatrix.length; r++) {
          const row = rawMatrix[r];
          if (!Array.isArray(row)) continue;
          const rowStr = row.map((c) => String(c || '').trim()).join(' ');
          const dm = rowStr.match(/(?:less\s*)?(?:dis|discount|কমিশন|ছাড়|কম)[:\s]*([0-9.,]+)\s*%/i);
          if (dm && dm[1]) {
            const v = parseFloat(dm[1].replace(/,/g, ''));
            if (!isNaN(v) && v > 0 && v <= 100) {
              foundDiscountPercent = v;
              break;
            }
          }
          for (let c = 0; c < row.length; c++) {
            const cell = String(row[c] || '').trim().toLowerCase();
            if (/(?:less\s*)?(?:discount|dis|কমিশন|ছাড়|কম)/i.test(cell)) {
              for (let nextC = c + 1; nextC <= Math.min(row.length - 1, c + 3); nextC++) {
                const nextVal = String(row[nextC] || '').trim();
                if (nextVal.includes('%')) {
                  const v = parseFloat(nextVal.replace(/[^0-9.]/g, ''));
                  if (!isNaN(v) && v > 0 && v <= 100) {
                    foundDiscountPercent = v;
                    break;
                  }
                }
                const numVal = parseFloat(nextVal.replace(/[^0-9.]/g, ''));
                if (!isNaN(numVal) && numVal > 0) {
                  if (numVal <= 100 && (cell.includes('%') || nextVal.includes('%'))) {
                    foundDiscountPercent = numVal;
                    break;
                  } else if (foundDiscountAmount === 0) {
                    foundDiscountAmount = numVal;
                  }
                }
              }
            }
            if (foundDiscountPercent > 0) break;
          }
          if (foundDiscountPercent > 0) break;
        }

        if (foundDiscountPercent === 0 && foundDiscountAmount > 0 && totalAmount > 0) {
          foundDiscountPercent = parseFloat(((foundDiscountAmount / (totalAmount + foundDiscountAmount)) * 100).toFixed(2));
        }

        if (foundDiscountPercent > 0) {
          header.discountPercent = foundDiscountPercent;
        }

        const currentResult: FastParsedChallanData = {
          header,
          lines: parsedLines,
          totalCoils,
          totalAmount,
          hasPrices: hasAnyPrice,
          missingPriceCount,
          isRecognizedTable: true
        };

        if (!bestParsedResult || currentResult.lines.length > bestParsedResult.lines.length) {
          bestParsedResult = currentResult;
        }
      }
    }

    return bestParsedResult;
  } catch (err) {
    console.warn('Fast Excel parsing skipped, falling back to server parsing:', err);
    return null;
  }
}
