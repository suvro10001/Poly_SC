import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { Item, PriceListRevision } from '../types';
import { formatDateDDMMYY, getTodayDDMMYY } from './dateUtils';
import {
  categorizeCableItem,
  cleanCategoryLabel,
  DEFAULT_CATEGORIES,
  getAllCategories,
  hasConductorOrModelItemSpec,
  isPureCableCategoryLabel,
  isSubCategoryQualifier,
  saveCustomCategory
} from './categoryHelper';
import { buildDeterministicItemId } from './priceCircularHelper';

/**
 * Reads an uploaded Excel (.xlsx, .xls) or delimited (.csv) File into an XLSX.WorkBook,
 * decoding UTF-8 CSV text properly so currency symbols (e.g. ৳) and Bengali headers remain intact.
 */
async function readWorkbookFromFile(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
  if (isCsv) {
    const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
    return XLSX.read(text, { type: 'string' });
  }
  return XLSX.read(buffer, { type: 'array' });
}

/**
 * Export item directory to XLSX with Opening Stock
 */
export function exportItemsToXLSX(items: Item[]) {
  const data = [
    ['Item Code', 'Item Description / Name', 'Unit', 'Rate (Tk)', 'Opening Stock (Coils)', 'Category'],
    ...items.map((item) => [
      item.code,
      item.name,
      item.unit,
      item.rate,
      item.openingStock || 0,
      item.category
    ])
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 14 },
    { wch: 42 },
    { wch: 10 },
    { wch: 14 },
    { wch: 22 },
    { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Item_Directory');
  XLSX.writeFile(wb, `Polycables_Item_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Sales & Stock Report to XLSX
 */
export function exportSalesReportToXLSX(
  reportData: Array<{
    code: string;
    name: string;
    unit: string;
    rate: number;
    openingStock: number;
    soldCoils: number;
    closingStock: number;
    totalAmount: number;
  }>,
  periodName: string,
  centerName: string = 'Madhupur Sales Center'
) {
  const data = [
    [`${centerName} — Sales & Stock Report (Period: ${periodName})`],
    ['Item Code', 'Name Of Items', 'Unit', 'Rate (Tk)', 'Opening Stock', 'Sold Qty (Coils)', 'Closing Stock', 'Total Sales Amount (Tk)'],
    ...reportData.map((r) => [
      r.code,
      r.name,
      r.unit,
      r.rate,
      r.openingStock,
      r.soldCoils,
      r.closingStock,
      r.totalAmount
    ])
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 14 },
    { wch: 40 },
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
    { wch: 16 },
    { wch: 15 },
    { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Sales_Stock_Report');
  const dateRangeMatch = periodName.match(/\(([^)]+)\)/);
  const dateRangeStr = dateRangeMatch ? `(${dateRangeMatch[1]})` : `(${periodName})`;
  XLSX.writeFile(wb, `Madhupur Sales Center Stock Report ${dateRangeStr}.xlsx`);
}

/**
 * Generate Item-Wise Sales & Stock Report Base64 for Email Attachment
 */
export function generateItemSalesReportBase64(
  reportData: Array<{
    code: string;
    name: string;
    unit: string;
    rate: number;
    openingStock: number;
    soldCoils: number;
    closingStock: number;
    totalAmount: number;
  }>,
  periodName: string,
  centerName: string = 'Madhupur Sales Center'
): string {
  const data = [
    [`${centerName} — Sales & Stock Report (Period: ${periodName})`],
    ['Item Code', 'Name Of Items', 'Unit', 'Rate (Tk)', 'Opening Stock', 'Sold Qty (Coils)', 'Closing Stock', 'Total Sales Amount (Tk)'],
    ...reportData.map((r) => [
      r.code,
      r.name,
      r.unit,
      r.rate,
      r.openingStock,
      r.soldCoils,
      r.closingStock,
      r.totalAmount
    ])
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 40 },
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
    { wch: 16 },
    { wch: 15 },
    { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Sales_Stock_Report');
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

/**
 * Build exact ExcelJS Workbook matching Print Preview & user image
 */
export async function createCategoryWiseStockExcelJSWorkbook(
  categoryGroups: Array<{
    categoryName: string;
    items: Array<{
      serialNo?: number;
      code?: string;
      name: string;
      sizeSpec?: string;
      unit?: string;
      rate?: number;
      openingStock: number;
      addedStock?: number;
      returnParty?: number;
      totalStock?: number;
      soldCoils: number;
      returnFactory?: number;
      closingStock: number;
      stockValue: number;
      reqNo?: string;
    }>;
    totals: {
      opening: number;
      added?: number;
      returnParty?: number;
      totalStock?: number;
      sold: number;
      returnFactory?: number;
      closing: number;
      stockValue: number;
    };
  }>,
  periodName: string,
  centerName: string = 'Madhupur Sales Center',
  billType: string = 'SHOWROOM'
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Poly Cables Ind. Ltd.';
  workbook.lastModifiedBy = 'Poly Cables Ind. Ltd.';
  workbook.created = new Date();
  workbook.modified = new Date();

  const ws = workbook.addWorksheet('Stock_Serial_Report', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
    },
    views: [{ showGridLines: true }]
  });

  // Define column widths matching the visual design with ample room for item description
  ws.columns = [
    { key: 'sl', width: 7.5 },
    { key: 'itemDescription', width: 46 },
    { key: 'opening', width: 14 },
    { key: 'received', width: 12 },
    { key: 'rparty', width: 12 },
    { key: 'totalQty', width: 14 },
    { key: 'sales', width: 12 },
    { key: 'refac', width: 12 },
    { key: 'closing', width: 16 },
    { key: 'reqNo', width: 12 },
    { key: 'stockValue', width: 19 }
  ];

  const darkThinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } }
  };

  // Row 1: POLY CABLES IND. LTD.
  const r1 = ws.addRow(['POLY CABLES IND. LTD.']);
  r1.height = 26;
  ws.mergeCells('A1:K1');
  const c1 = ws.getCell('A1');
  c1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF000000' } };
  c1.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2: MADHUPUR SALES CENTER
  const r2 = ws.addRow([centerName.toUpperCase()]);
  r2.height = 18;
  ws.mergeCells('A2:K2');
  const c2 = ws.getCell('A2');
  c2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
  c2.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3: STOCK SERIAL REPORT (CATEGORY WISE)
  const r3 = ws.addRow(['STOCK SERIAL REPORT (CATEGORY WISE)']);
  r3.height = 22;
  ws.mergeCells('A3:K3');
  const c3 = ws.getCell('A3');
  c3.font = { name: 'Calibri', size: 11, bold: true, underline: true, color: { argb: 'FF000000' } };
  c3.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 4: Period | Bill Type | Date
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  const r4 = ws.addRow([
    `Period:  ${periodName}`, '', '', '',
    `Bill Type:  ${billType}`, '', '',
    `Date:  ${dateStr}`, '', '', ''
  ]);
  r4.height = 20;
  ws.mergeCells('A4:D4');
  ws.mergeCells('E4:G4');
  ws.mergeCells('H4:K4');

  const c4Left = ws.getCell('A4');
  c4Left.font = { name: 'Calibri', size: 9.5, bold: false, color: { argb: 'FF000000' } };
  c4Left.alignment = { horizontal: 'left', vertical: 'middle' };

  const c4Mid = ws.getCell('E4');
  c4Mid.font = { name: 'Calibri', size: 9.5, bold: false, color: { argb: 'FF000000' } };
  c4Mid.alignment = { horizontal: 'center', vertical: 'middle' };

  const c4Right = ws.getCell('H4');
  c4Right.font = { name: 'Calibri', size: 9.5, bold: false, color: { argb: 'FF000000' } };
  c4Right.alignment = { horizontal: 'right', vertical: 'middle' };

  // Solid black separator under row 4 across cols A..K
  for (let c = 1; c <= 11; c++) {
    const cell = ws.getCell(4, c);
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF000000' } }
    };
  }

  // Row 5: Blank separator
  const r5 = ws.addRow([]);
  r5.height = 6;

  // Row 6: Table Header
  const headerTitles = [
    'SL #',
    'Items Name',
    'Op. Qty.',
    'Received',
    'R.Party',
    'Total',
    'Sales',
    'Re. Fac.',
    'Closing Qty',
    'Req No.',
    'Stock Value'
  ];
  const headerRow = ws.addRow(headerTitles);
  headerRow.height = 24;

  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF000000' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF5' }
    };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: false
    };
    cell.border = darkThinBorder;
  });

  let grandOpening = 0;
  let grandReceived = 0;
  let grandRParty = 0;
  let grandTotalStock = 0;
  let grandSold = 0;
  let grandRFactory = 0;
  let grandClosing = 0;
  let grandStockValue = 0;

  const formatTaka = (val: number) => {
    if (!val || val === 0) return '';
    return `৳${val.toLocaleString('en-IN')}`;
  };

  categoryGroups.forEach((group) => {
    // Category Banner Row
    const catRow = ws.addRow([group.categoryName.toUpperCase(), '', '', '', '', '', '', '', '', '', '']);
    catRow.height = 22;
    const catRowIdx = catRow.number;
    ws.mergeCells(`A${catRowIdx}:K${catRowIdx}`);

    for (let c = 1; c <= 11; c++) {
      const cell = ws.getCell(catRowIdx, c);
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = darkThinBorder;
    }

    // Item Rows
    group.items.forEach((item) => {
      const rec = item.addedStock || 0;
      const rp = item.returnParty || 0;
      const tot = item.totalStock || (item.openingStock + rec + rp);
      const retFac = item.returnFactory || 0;
      const stockVal = item.stockValue || 0;

      const itemRow = ws.addRow([
        item.serialNo != null ? Number(item.serialNo) || item.serialNo : '',
        item.name || item.sizeSpec || '',
        item.openingStock || 0,
        rec > 0 ? rec : '-',
        rp > 0 ? rp : '-',
        tot || 0,
        item.soldCoils > 0 ? item.soldCoils : '-',
        retFac > 0 ? retFac : '-',
        item.closingStock || 0,
        item.reqNo && item.reqNo !== '-' ? item.reqNo : '-',
        formatTaka(stockVal)
      ]);
      itemRow.height = 20;

      // Style each cell in item row
      for (let c = 1; c <= 11; c++) {
        const cell = itemRow.getCell(c);
        cell.border = darkThinBorder;

        if (c === 1) { // SL
          cell.font = { name: 'Calibri', size: 9.5, bold: false };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (c === 2) { // Item Description
          cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: false };
        } else if (c === 6 || c === 9) { // Total Qty & Closing (Bold)
          cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (c === 11) { // Stock Value (Bold & Right)
          cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else { // Opening, Received, R.Party, Sales, Re. Fac, Req No
          cell.font = { name: 'Calibri', size: 9.5, bold: false };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      }
    });

    const groupRec = group.totals.added || 0;
    const groupRP = group.totals.returnParty || 0;
    const groupTot = group.totals.totalStock || (group.totals.opening + groupRec + groupRP);
    const groupRF = group.totals.returnFactory || 0;
    const groupVal = group.totals.stockValue || 0;

    // Subtotal Row
    const subtotalRow = ws.addRow([
      '',
      `Subtotal (${group.categoryName}):`,
      group.totals.opening || 0,
      groupRec > 0 ? groupRec : '-',
      groupRP > 0 ? groupRP : '-',
      groupTot || 0,
      group.totals.sold > 0 ? group.totals.sold : '-',
      groupRF > 0 ? groupRF : '-',
      group.totals.closing || 0,
      '-',
      formatTaka(groupVal)
    ]);
    subtotalRow.height = 22;

    for (let c = 1; c <= 11; c++) {
      const cell = subtotalRow.getCell(c);
      cell.border = darkThinBorder;
      cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF000000' } };
      if (c === 2 || c === 11) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }

    grandOpening += group.totals.opening;
    grandReceived += groupRec;
    grandRParty += groupRP;
    grandTotalStock += groupTot;
    grandSold += group.totals.sold;
    grandRFactory += groupRF;
    grandClosing += group.totals.closing;
    grandStockValue += groupVal;
  });

  // Grand Warehouse Total Row
  const grandRow = ws.addRow([
    '',
    'GRAND WAREHOUSE TOTAL:',
    grandOpening,
    grandReceived > 0 ? grandReceived : '-',
    grandRParty > 0 ? grandRParty : '-',
    grandTotalStock,
    grandSold > 0 ? grandSold : '-',
    grandRFactory > 0 ? grandRFactory : '-',
    grandClosing,
    '-',
    formatTaka(grandStockValue)
  ]);
  grandRow.height = 24;

  for (let c = 1; c <= 11; c++) {
    const cell = grandRow.getCell(c);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'double', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };
    if (c === 2 || c === 11) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  return workbook;
}

/**
 * Export Category-Wise Stock Report to XLSX (Pixel-perfect styling and borders matching print/image)
 */
export async function exportCategoryWiseStockReportToXLSX(
  categoryGroups: Array<{
    categoryName: string;
    items: Array<any>;
    totals: any;
  }>,
  periodName: string,
  centerName: string = 'Madhupur Sales Center',
  billType: string = 'SHOWROOM'
): Promise<void> {
  const workbook = await createCategoryWiseStockExcelJSWorkbook(categoryGroups, periodName, centerName, billType);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  const dateRangeMatch = periodName.match(/\(([^)]+)\)/);
  const dateRangeStr = dateRangeMatch ? `(${dateRangeMatch[1]})` : `(${periodName})`;
  a.download = `Madhupur Sales Center Stock Report ${dateRangeStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate Category-Wise Stock Report Base64 for Email Attachment (Same as Print Preview & Excel export)
 */
export async function generateCategoryWiseStockReportBase64(
  categoryGroups: Array<{
    categoryName: string;
    items: Array<any>;
    totals: any;
  }>,
  periodName: string,
  centerName: string = 'Madhupur Sales Center',
  billType: string = 'SHOWROOM'
): Promise<string> {
  const workbook = await createCategoryWiseStockExcelJSWorkbook(categoryGroups, periodName, centerName, billType);
  const buffer = await workbook.xlsx.writeBuffer();
  const uint8Array = new Uint8Array(buffer);
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Export price update template XLSX
 */
export function exportPriceUpdateTemplate(items: Item[]) {
  const data = [
    ['Item Code', 'Item Name', 'Current Rate (Tk)', 'New Rate (Tk)'],
    ...items.map((item) => [
      item.code,
      item.name,
      item.rate,
      item.rate // Prefilled so user can edit in Excel
    ])
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 14 },
    { wch: 40 },
    { wch: 18 },
    { wch: 18 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Price_Update');
  XLSX.writeFile(wb, `Price_Update_Template_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Parse uploaded XLSX for bulk item import (Ultra-robust for all Excel layouts)
 */
export interface ExcelItemImportIssue {
  sheetName: string;
  rowNumber: number;
  itemName: string;
  problem: string;
  howToFix: string;
  severity: 'warning' | 'error';
}

export interface DetectedItemColumns {
  headerRowIndex: number;
  dataStartRow: number;
  serial: number;
  code: number;
  name: number;
  category: number;
  spec: number;
  unit: number;
  rate: number;
  opening: number;
  minStock: number;
  remarks: number;
}

export interface ParsedSheetItemRow {
  excelRowNumber: number;
  serial?: number | string;
  code: string;
  name: string;
  category: string;
  hasExplicitCategory: boolean;
  sizeSpec: string;
  unit: string;
  hasExplicitUnit: boolean;
  rate: number;
  hasExplicitRate: boolean;
  openingStock: number;
  hasExplicitStock: boolean;
  minStockAlert?: number;
  remarks: string;
}

/**
 * Remove any redundant leading serial number from item description/name
 * (e.g. "01. 1 X 1.0 RE" -> "1 X 1.0 RE", "1. 1.5 RM BYA" -> "1.5 RM BYA")
 * so the item name field never duplicates or shows the serial.
 */
/**
 * Checks if a string starts with a core cable specification (e.g. '1 x 25 Rm', '1 pair', '2 pair', '3/0.029').
 * The leading number in these strings represents conductor cores, pairs, or wire gauge, NEVER a serial prefix.
 */
export function isCableSpecificationStart(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return /^\d+(?:\.\d+)?\s*(?:x|\*|\/|pair|pairs|pr|prs|core|cores|c\b|rm|re|sm|se|sq|sqmm|mm|swg)\b/i.test(trimmed);
}

/**
 * Remove any redundant leading serial number from item description/name
 * (e.g. "01. 1 X 1.0 RE" -> "1 X 1.0 RE", "01 - 1 X 1.0 RE" -> "1 X 1.0 RE")
 * so the item name field never duplicates or shows the serial,
 * while strictly preserving decimal cable sizes ("1.5 RM", "2.5 RE") and items like '1 x 25 Rm', '1 pair'.
 */
export function cleanItemNameDisplay(name: string, serial?: number | string): string {
  if (!name) return '';
  let trimmed = name.trim().replace(/\s+/g, ' ');

  // If the string starts with a core/decimal cable specification (e.g. "1.5 RM", "2.5 RE", "1 x 25 Rm", "1 pair"):
  // The leading number is a vital part of the cable specification, NEVER a serial prefix!
  if (isCableSpecificationStart(trimmed)) {
    return trimmed;
  }

  // Strip explicit serial prefix with punctuation delimiter (NEVER match a decimal dot like "1.5"!)
  const mPunct = trimmed.match(/^0*(\d{1,4})(?:\.(?!\d)|[)\-])\s*(?=[a-zA-Z]|\d+\s*(?:x|\*|\/|\.|pair|rm|re|bya|sq|flexible|coils|mtr))/i);
  if (mPunct && !/^\d+\.\d+\s*(rm|re|sq|mm)/i.test(trimmed)) {
    const candidate = trimmed.slice(mPunct[0].length).trim();
    if (candidate) trimmed = candidate;
  }

  // Also check if serial matches the start of name followed by non-decimal dot, dash, closing parenthesis, or space
  if (serial !== undefined && serial !== null && serial !== '') {
    const sStr = String(serial).trim();
    if (sStr) {
      const escaped = sStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^0*${escaped}(?:\\.(?!\\d)\\s*|[)\\-]\\s*|\\s+)`, 'i');
      if (regex.test(trimmed)) {
        const stripped = trimmed.replace(regex, '').trim();
        // NEVER strip if the resulting string is left as "x 25 Rm" or "pair"
        if (!/^(?:x|\*|pair|pairs|pr|prs|core|cores)\b/i.test(stripped) && stripped) {
          trimmed = stripped;
        }
      }
    }
  }
  return trimmed;
}

type ExcelHeaderRole =
  | 'serial'
  | 'code'
  | 'name'
  | 'category'
  | 'spec'
  | 'unit'
  | 'updateRate'
  | 'rate'
  | 'amountRate'
  | 'oldRate'
  | 'opening'
  | 'minStock'
  | 'remarks'
  | null;

const KNOWN_UNIT_WORDS = new Set([
  'coil', 'coils', 'mtr', 'mtrs', 'meter', 'meters', 'metre', 'metres',
  'bobin', 'bobins', 'bobbin', 'bobbins', 'pcs', 'pc', 'piece', 'pieces',
  'roll', 'rolls', 'drum', 'drums', 'feet', 'ft', 'yard', 'yards', 'yd',
  'set', 'sets', 'pkt', 'packet', 'box', 'kg', 'kgs', 'pair', 'pairs', 'কয়েল', 'মিটার'
]);

const JUNK_ROW_PHRASES = new Set([
  'sl', 'sl.', 'sl. no', 'sl no', 's.l.', 's.l', 'no', 'no.', 'item', 'items',
  'item name', 'items name', 'item description', 'description', 'particular', 'particulars',
  'product', 'product name', 'name', 'name of items', 'name of item', 'rate',
  'price', 'amount', 'total', 'subtotal', 'grand total', 'grand warehouse total', 'note', 'notes',
  'page', 'page 1', 'sheet', 'sheet1', 'poly cables', 'polycables',
  'poly cables ind. ltd.', 'poly cables industries ltd.', 'price list', 'madhupur', 'sales center',
  'madhupur sales center', 'stock serial report', 'stock serial report (category wise)',
  'holding no.', 'holding no', 'category', 'categories', 'unit', 'units', 'code', 'item code',
  'details', 'remarks', 'sr. no', 'sr no', 's.n.', 's.n', 'unit price',
  'rate (tk)', 'price (tk)', 'mrp', 'tk', 'opening stock', 'closing stock',
  'sl/no', 'sl / no', 'sl#', 'sl #', 'item#', 'serial', 'serial no',
  'item name / description', 'item description / name', 'price / rate (tk)',
  'new rate / update price (tk)', 'size / specification', 'authorized signature'
]);

function normalizeHeaderText(raw: any): string {
  if (raw === undefined || raw === null) return '';
  return String(raw)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripHeaderPunctuation(norm: string): string {
  return norm
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[*#:._/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeCableDataCell(norm: string): boolean {
  if (!norm) return false;
  if (isPureCableCategoryLabel(norm)) return false;
  // Starts with currency symbol or plain number (not a voltage banner like "11 KV")
  if (/^[৳$€£]\s*\d/.test(norm)) return true;
  if (/^\d[\d,.]*$/.test(norm)) return true;
  // Header cells like "100m Rate" or "90m Coil Price" must still be evaluated as rate headers
  if (
    /\b(price|rate|mrp|cost|taka|bdt)\b/i.test(norm) &&
    !/\b\d+(?:\.\d+)?\s*(?:rm|re|sm|se|sq)/i.test(norm)
  ) {
    return false;
  }
  // Contains concrete cable size / conductor / model notation (e.g. "1x1.5 rm", "1 x 35 rm", "2.5 sqmm", "70/76", "3/22")
  if (hasConductorOrModelItemSpec(norm)) return true;
  return false;
}

function hasWordToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\b)${escaped}(?:$|\\b)`, 'i').test(text);
}

function classifyHeaderCell(rawCell: any): ExcelHeaderRole {
  const norm = normalizeHeaderText(rawCell);
  if (!norm || norm.length > 56) return null;
  if (looksLikeCableDataCell(norm)) return null;

  const bare = stripHeaderPunctuation(norm);
  if (!bare) return null;

  // Reject multi-word report / company title banners so they never masquerade as column headers
  if (
    (bare.includes('price list') ||
      bare.includes('rate list') ||
      bare.includes('stock serial') ||
      bare.includes('poly cables') ||
      bare.includes('polycables') ||
      bare.includes('madhupur sales')) &&
    !bare.includes('new price') &&
    !bare.includes('update price')
  ) {
    return null;
  }

  // 1. Serial Number (MUST NOT be mapped to Item Code!)
  if (
    /^(sl|s\s*l|sr|s\s*n|serial)(\s*(no|num|number))?$/i.test(bare) ||
    norm === 'sl#' ||
    norm === 'sl #' ||
    norm === 's/n' ||
    norm === 'no' ||
    norm === 'no.' ||
    norm === 'ক্রমিক' ||
    norm === 'ক্রমিক নং' ||
    norm === 'নং'
  ) {
    return 'serial';
  }

  // 2. Updated / Revised Price (highest priority rate column for price-update sheets)
  if (
    ['update price', 'update rate', 'updated price', 'updated rate', 'new rate', 'new price', 'revised rate', 'revised price', 'present rate', 'latest price', 'নতুন দর', 'নতুন মূল্য'].some(
      (kw) => norm.includes(kw) || bare.includes(kw)
    )
  ) {
    return 'updateRate';
  }

  // 3. Item Code / SKU
  if (
    [
      'item code', 'product code', 'cable code', 'material code', 'goods code',
      'part code', 'part no', 'sku', 'item id', 'product id', 'code no', 'আইটেম কোড', 'কোড'
    ].some((kw) => bare === kw || bare.includes(kw)) ||
    bare === 'code' ||
    norm === 'item#' ||
    norm === 'code#'
  ) {
    return 'code';
  }

  // 4. Category / Group / Series (exclude "pack type" which belongs to Unit)
  if (
    bare !== 'pack type' &&
    ([
      'item category', 'product category', 'cable category', 'sub category', 'subcategory',
      'categories', 'category', 'group name', 'item group', 'product group', 'cable group',
      'group', 'cable type', 'item type', 'wire type', 'product type', 'series',
      'ক্যাটাগরি', 'গ্রুপ', 'ধরণ'
    ].some((kw) => bare === kw || bare.includes(kw)) ||
      hasWordToken(bare, 'cat') ||
      bare === 'type')
  ) {
    return 'category';
  }

  // 5. Size / Specification (check before Name so "Size / Specification" isn't grabbed as Name; promoted to Name when Name is absent)
  if (
    [
      'size specification', 'size spec', 'specifications', 'specification', 'specs',
      'cable size', 'wire size', 'conductor size', 'item size', 'dimensions', 'dimension',
      'gauge', 'sqmm', 'সাইজ'
    ].some((kw) => bare === kw || bare.includes(kw)) ||
    bare === 'spec' ||
    bare === 'size'
  ) {
    return 'spec';
  }

  // 6. Minimum Stock / Reorder Alert
  if (
    ['min stock', 'minimum stock', 'min qty', 'stock alert', 'min alert', 'reorder'].some(
      (kw) => bare === kw || bare.includes(kw)
    )
  ) {
    return 'minStock';
  }

  // 7. Opening Stock / Quantity (exclude price/rate/value columns like "Stock Value" or "Unit Price")
  if (
    !norm.includes('price') &&
    !norm.includes('rate') &&
    !norm.includes('value') &&
    !norm.includes('amount') &&
    !hasWordToken(bare, 'tk') &&
    !hasWordToken(bare, 'bdt') &&
    ([
      'opening stock', 'opening qty', 'op qty', 'opening balance', 'opening bal',
      'initial stock', 'stock qty', 'stock coils', 'available stock', 'current stock',
      'in stock', 'on hand', 'coil qty', 'qty coils', 'স্টক', 'পরিমাণ'
    ].some((kw) => bare === kw || bare.includes(kw)) ||
      bare === 'opening' ||
      bare === 'stock' ||
      bare === 'qty' ||
      bare === 'quantity' ||
      bare === 'coils')
  ) {
    return 'opening';
  }

  // 8. Unit / UOM / Per (exclude "Unit Price" / "Unit Rate" / "Per Coil Rate"!)
  if (
    !norm.includes('price') &&
    !norm.includes('rate') &&
    !norm.includes('cost') &&
    !norm.includes('value') &&
    !norm.includes('amount') &&
    ([
      'unit of measure', 'measurement unit', 'units', 'unit', 'u o m',
      'packing', 'pack type', 'pack', 'coil mtr', 'একক'
    ].some((kw) => bare === kw || bare.includes(kw)) ||
      hasWordToken(bare, 'uom') ||
      bare === 'per' ||
      bare.startsWith('per '))
  ) {
    return 'unit';
  }

  // 8b. Old / Previous Rate (lower priority than active/new/update price columns)
  if (
    [
      'previous rate', 'previous price', 'prev rate', 'prev price', 'old rate', 'old price',
      'last rate', 'last price', 'পূর্বের দর', 'পূর্বের মূল্য'
    ].some((kw) => bare === kw || bare.includes(kw) || norm.includes(kw))
  ) {
    return 'oldRate';
  }

  // 9. Price / Rate
  if (
    !norm.includes('stock') &&
    !norm.includes('discount') &&
    !norm.includes('date') &&
    ([
      'unit price', 'unit rate', 'coil price', 'coil rate', 'mtr rate', 'meter rate',
      'item price', 'item rate', 'product price', 'product rate', 'cable price', 'cable rate',
      'sales price', 'sales rate', 'selling price', 'selling rate', 'selling cost', 'list price',
      'trade price', 'trade rate', 'dealer price', 'dealer rate', 'billing rate', 'net price',
      'net rate', 'current rate', 'current price', 'offer price', 'rate coil', 'price coil',
      'rate mtr', 'price mtr', 'rate unit', 'price unit', 'rates', 'rate', 'prices', 'price',
      'm r p', 'taka', 'দর', 'মূল্য', 'টাকা', 'রেট'
    ].some((kw) => bare === kw || bare.includes(kw) || norm === kw) ||
      norm === '৳' ||
      hasWordToken(bare, 'mrp') ||
      hasWordToken(bare, 'bdt') ||
      hasWordToken(bare, 'tk') ||
      hasWordToken(bare, 'tp') ||
      hasWordToken(bare, 'dp') ||
      hasWordToken(bare, 'cost') ||
      /\b(rate|price|mrp)\b/i.test(norm))
  ) {
    return 'rate';
  }

  // 9b. Fallback "Amount" rate column (lower priority than Rate / Price / MRP / Update Price)
  if (
    !norm.includes('stock') &&
    !norm.includes('total') &&
    !norm.includes('net amount') &&
    !norm.includes('bill amount') &&
    !norm.includes('discount') &&
    !norm.includes('vat') &&
    !norm.includes('tax') &&
    !norm.includes('date') &&
    (bare === 'amount' || bare === 'amt' || bare === 'unit amount' || bare === 'item amount')
  ) {
    return 'amountRate';
  }

  // 10. Item Name / Description
  if (
    [
      'item name description', 'item description name', 'description of goods',
      'description of items', 'name of item', 'name of items', 'item name', 'items name',
      'item description', 'items description', 'item title', 'product name', 'products name',
      'product description', 'product details', 'cable name', 'cables name', 'cable description',
      'wire name', 'goods name', 'material name', 'material description', 'model name',
      'particulars', 'particular', 'description',
      'products', 'product', 'items', 'item', 'name', 'goods', 'model',
      'পণ্যের নাম', 'মালের বিবরণ', 'আইটেম', 'বিবরণ', 'নাম'
    ].some((kw) => bare === kw || bare.includes(kw))
  ) {
    return 'name';
  }

  // 11. Remarks / Notes
  if (
    ['remarks', 'remark', 'notes', 'note', 'comment', 'comments', 'মন্তব্য'].some(
      (kw) => bare === kw || bare.includes(kw)
    )
  ) {
    return 'remarks';
  }

  return null;
}

function normalizeBengaliDigits(str: string): string {
  const map: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
  };
  return str.replace(/[০-৯]/g, (d) => map[d] || d);
}

function parseNumericPriceCell(raw: any): { value: number; valid: boolean; empty: boolean } {
  if (raw === undefined || raw === null) return { value: 0, valid: true, empty: true };
  if (typeof raw === 'number') {
    return isNaN(raw) ? { value: 0, valid: false, empty: false } : { value: Math.max(0, raw), valid: true, empty: false };
  }
  const str = normalizeBengaliDigits(String(raw)).replace(/\u00a0/g, ' ').trim();
  if (!str || str === '-' || str === '—' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'nil') {
    return { value: 0, valid: true, empty: true };
  }
  const cleaned = str
    .replace(/\b(?:bdt|taka|tk|mrp)\.?(?=\s|\d|$)/gi, '')
    .replace(/[৳$€£,\s]/g, '')
    .replace(/\/[-=]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\/?(?:coil|coils|mtr|mtrs|meter|meters|pc|pcs|bobin|bobbin)$/i, '')
    .trim();
  if (!cleaned) return { value: 0, valid: true, empty: true };
  const num = Number(cleaned);
  if (!isNaN(num) && isFinite(num)) {
    return { value: Math.max(0, num), valid: true, empty: false };
  }
  return { value: 0, valid: false, empty: false };
}

function matchesKnownCategoryText(text: string, knownCategoryLowerSet: Set<string>): boolean {
  return isPureCableCategoryLabel(text, knownCategoryLowerSet);
}

/**
 * Propagates single-column vertical merges in Excel worksheets ONLY when the merged top cell
 * is a Category label (e.g. "(H.T XLPE Cable)\n(Copper Tape Screen)") or Unit word (e.g. "Meters"),
 * ensuring every cable size row alongside a vertically merged category cell receives its category.
 */
export function expandSheetVerticalCategoryMerges(ws: XLSX.WorkSheet, rawRows: any[][]): any[][] {
  if (!ws || !Array.isArray(rawRows) || rawRows.length === 0) return rawRows;
  const merges = ws['!merges'];
  if (!Array.isArray(merges) || merges.length === 0) return rawRows;

  const cloned = rawRows.map((r) => (Array.isArray(r) ? [...r] : []));
  for (const m of merges) {
    if (!m || !m.s || !m.e) continue;
    if (m.s.c !== m.e.c || m.e.r <= m.s.r) continue;
    const col = m.s.c;
    const topCell = cloned[m.s.r]?.[col];
    if (topCell === undefined || topCell === null) continue;
    const topStr = cleanCategoryLabel(String(topCell));
    if (!topStr) continue;

    if (isPureCableCategoryLabel(topStr) || KNOWN_UNIT_WORDS.has(topStr.toLowerCase())) {
      for (let r = m.s.r + 1; r <= Math.min(m.e.r, cloned.length - 1); r++) {
        if (!Array.isArray(cloned[r])) cloned[r] = [];
        const existing = cloned[r][col];
        if (existing === undefined || existing === null || String(existing).trim() === '') {
          cloned[r][col] = topStr;
        }
      }
    }
  }
  return cloned;
}

function normalizeUnitValue(rawUnit: string, fallbackName: string): string {
  const u = rawUnit.trim();
  if (!u) {
    if (/bobin|bobbin/i.test(fallbackName)) return 'Bobin';
    if (/\b(meter|meters|mtr|500\s*m|1000\s*m)\b/i.test(fallbackName)) return 'Meters';
    return 'Coils';
  }
  const low = u.toLowerCase();
  if (low === 'coil' || low === 'coils' || low === 'কয়েল') return 'Coils';
  if (low === 'meter' || low === 'meters' || low === 'mtr' || low === 'mtrs' || low === 'metre' || low === 'মিটার') return 'Meters';
  if (low === 'bobin' || low === 'bobins' || low === 'bobbin' || low === 'bobbins') return 'Bobin';
  if (low === 'pc' || low === 'pcs' || low === 'piece' || low === 'pieces') return 'Pcs';
  return u;
}

/**
 * Shared smart column & row parser used by both Master Item Directory Import (.xlsx)
 * and BulkItemUploadModal so every Excel layout accurately identifies Item Name, Category, Price, Unit, Code, Spec, and Stock.
 */
export function detectAndParseItemSheetRows(
  rawRows: any[][],
  sheetName: string,
  overrideColumns?: Partial<DetectedItemColumns>
): {
  columns: DetectedItemColumns;
  headerLabels: string[];
  rows: ParsedSheetItemRow[];
  issues: ExcelItemImportIssue[];
} {
  const issues: ExcelItemImportIssue[] = [];
  const emptyCols: DetectedItemColumns = {
    headerRowIndex: -1,
    dataStartRow: 0,
    serial: -1,
    code: -1,
    name: -1,
    category: -1,
    spec: -1,
    unit: -1,
    rate: -1,
    opening: -1,
    minStock: -1,
    remarks: -1
  };

  if (!rawRows || rawRows.length === 0) {
    return { columns: emptyCols, headerLabels: [], rows: [], issues };
  }

  let maxCols = 0;
  for (let r = 0; r < Math.min(rawRows.length, 80); r++) {
    if (Array.isArray(rawRows[r]) && rawRows[r].length > maxCols) {
      maxCols = rawRows[r].length;
    }
  }

  const knownCategories = [...DEFAULT_CATEGORIES, ...getAllCategories()];
  const knownCategoryLowerSet = new Set(knownCategories.map((c) => c.trim().toLowerCase()));
  knownCategoryLowerSet.add('bya');
  knownCategoryLowerSet.add('nym');
  knownCategoryLowerSet.add('nyy');
  knownCategoryLowerSet.add('flexible');

  // 1. Score first 35 rows to locate the true Header Row accurately
  let bestHeaderRow = -1;
  let bestScore = 0;
  let bestRoles: ExcelHeaderRole[] = [];

  const scanLimit = Math.min(rawRows.length, 35);
  for (let r = 0; r < scanLimit; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    const nonEmptyCells = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');
    if (nonEmptyCells.length === 0) continue;

    const roles = row.map((cell) => classifyHeaderCell(cell));
    const matchedRoles = roles.filter((rl): rl is NonNullable<ExcelHeaderRole> => rl !== null);
    if (matchedRoles.length === 0) continue;

    // Count how many non-header cells look like real cable/numeric data on this row
    const dataLikeCount = row.filter((c, idx) => roles[idx] === null && looksLikeCableDataCell(normalizeHeaderText(c))).length;
    if (dataLikeCount > matchedRoles.length) continue;

    const uniqueRoles = new Set(matchedRoles);
    let score = uniqueRoles.size * 2;
    if (uniqueRoles.has('name')) score += 4;
    if (uniqueRoles.has('rate') || uniqueRoles.has('updateRate')) score += 3;
    else if (uniqueRoles.has('amountRate')) score += 2;
    if (uniqueRoles.has('category')) score += 2;
    if (uniqueRoles.has('unit')) score += 2;
    if (uniqueRoles.has('code')) score += 2;
    if (uniqueRoles.has('serial')) score += 1;

    // Require either >= 2 matched header columns, OR a clear single primary header (even with extra unknown columns)
    const isValidHeader =
      uniqueRoles.size >= 2 ||
      (uniqueRoles.size === 1 &&
        dataLikeCount === 0 &&
        (uniqueRoles.has('name') ||
          uniqueRoles.has('spec') ||
          (nonEmptyCells.length <= 2 && (uniqueRoles.has('rate') || uniqueRoles.has('amountRate')))));

    // Prevent later page-break repeated headers from overriding an earlier valid Name+Rate header that already has data below it
    if (bestHeaderRow !== -1 && bestScore >= 11 && r > bestHeaderRow + 2) {
      let hasDataBetween = false;
      for (let mid = bestHeaderRow + 1; mid < r; mid++) {
        const mRow = rawRows[mid];
        if (!Array.isArray(mRow)) continue;
        if (mRow.some((c) => looksLikeCableDataCell(normalizeHeaderText(c)))) {
          hasDataBetween = true;
          break;
        }
      }
      if (hasDataBetween) {
        break;
      }
    }

    if (isValidHeader && score > bestScore) {
      bestScore = score;
      bestHeaderRow = r;
      bestRoles = roles;
    }
  }

  const columns: DetectedItemColumns = { ...emptyCols };

  if (bestHeaderRow !== -1) {
    columns.headerRowIndex = bestHeaderRow;
    columns.dataStartRow = bestHeaderRow + 1;

    let fallbackRateCol = -1;
    let fallbackAmountCol = -1;
    let fallbackOldRateCol = -1;
    bestRoles.forEach((role, idx) => {
      if (!role) return;
      if (role === 'serial' && columns.serial === -1) columns.serial = idx;
      else if (role === 'code' && columns.code === -1) columns.code = idx;
      else if (role === 'name' && columns.name === -1) columns.name = idx;
      else if (role === 'category' && columns.category === -1) columns.category = idx;
      else if (role === 'spec' && columns.spec === -1) columns.spec = idx;
      else if (role === 'unit' && columns.unit === -1) columns.unit = idx;
      else if (role === 'updateRate' && columns.rate === -1) columns.rate = idx;
      else if (role === 'rate') {
        if (columns.rate === -1 && fallbackRateCol === -1) fallbackRateCol = idx;
      } else if (role === 'amountRate') {
        if (fallbackAmountCol === -1) fallbackAmountCol = idx;
      } else if (role === 'oldRate') {
        if (fallbackOldRateCol === -1) fallbackOldRateCol = idx;
      } else if (role === 'opening' && columns.opening === -1) columns.opening = idx;
      else if (role === 'minStock' && columns.minStock === -1) columns.minStock = idx;
      else if (role === 'remarks' && columns.remarks === -1) columns.remarks = idx;
    });
    if (columns.rate === -1) {
      if (fallbackRateCol !== -1) columns.rate = fallbackRateCol;
      else if (fallbackAmountCol !== -1) columns.rate = fallbackAmountCol;
      else if (fallbackOldRateCol !== -1) columns.rate = fallbackOldRateCol;
    }

    // Check if the immediate next row is a merged sub-header row (e.g. Row 1: "Item Details | Pricing", Row 2: "Name | Category | Rate (Tk)")
    if (bestHeaderRow + 1 < rawRows.length && Array.isArray(rawRows[bestHeaderRow + 1])) {
      const subRow = rawRows[bestHeaderRow + 1];
      const subRoles = subRow.map((c) => classifyHeaderCell(c));
      const subMatched = subRoles.filter((rl) => rl !== null).length;
      const subHasData = subRow.some((c, idx) => subRoles[idx] === null && looksLikeCableDataCell(normalizeHeaderText(c)));
      if (subMatched >= 1 && !subHasData) {
        subRoles.forEach((role, idx) => {
          if (!role) return;
          if (role === 'serial' && columns.serial === -1) columns.serial = idx;
          else if (role === 'code' && columns.code === -1) columns.code = idx;
          else if (role === 'name' && columns.name === -1) columns.name = idx;
          else if (role === 'category' && columns.category === -1) columns.category = idx;
          else if (role === 'spec' && columns.spec === -1) columns.spec = idx;
          else if (role === 'unit' && columns.unit === -1) columns.unit = idx;
          else if (role === 'updateRate') columns.rate = idx;
          else if ((role === 'rate' || role === 'amountRate') && columns.rate === -1) columns.rate = idx;
          else if (role === 'opening' && columns.opening === -1) columns.opening = idx;
          else if (role === 'minStock' && columns.minStock === -1) columns.minStock = idx;
          else if (role === 'remarks' && columns.remarks === -1) columns.remarks = idx;
        });
        columns.dataStartRow = bestHeaderRow + 2;
      }
    }
  }

  // 2. Smart Data-Content Inference for headerless sheets OR columns whose header cell was left blank
  const assignedCols = new Set<number>(
    [
      columns.serial,
      columns.code,
      columns.name,
      columns.category,
      columns.spec,
      columns.unit,
      columns.rate,
      columns.opening,
      columns.minStock,
      columns.remarks
    ].filter((idx) => idx !== -1)
  );

  const canInferCol = (c: number): boolean => {
    if (assignedCols.has(c)) return false;
    if (columns.headerRowIndex === -1) return true;
    const hdrCell = rawRows[columns.headerRowIndex]?.[c];
    return hdrCell === undefined || hdrCell === null || String(hdrCell).trim() === '';
  };

  interface ColStats {
    col: number;
    nonEmpty: number;
    numCount: number;
    numValues: number[];
    sequentialMatches: number;
    currencyHits: number;
    unitHits: number;
    codeHits: number;
    catHits: number;
    cableSizeHits: number;
    textValues: string[];
    uniqueTexts: Set<string>;
  }

  const colStatsList: ColStats[] = [];
  for (let c = 0; c < maxCols; c++) {
    if (!canInferCol(c)) continue;
    const st: ColStats = {
      col: c,
      nonEmpty: 0,
      numCount: 0,
      numValues: [],
      sequentialMatches: 0,
      currencyHits: 0,
      unitHits: 0,
      codeHits: 0,
      catHits: 0,
      cableSizeHits: 0,
      textValues: [],
      uniqueTexts: new Set<string>()
    };

    let prevNum: number | null = null;
    for (let r = columns.dataStartRow; r < Math.min(rawRows.length, columns.dataStartRow + 100); r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;
      const rawVal = row[c];
      if (rawVal === undefined || rawVal === null) continue;
      const str = String(rawVal).trim();
      if (!str || str === '-' || str === '—') continue;
      if (JUNK_ROW_PHRASES.has(str.toLowerCase())) continue;

      st.nonEmpty++;
      if (/[৳$]|tk\.?|bdt/i.test(str)) st.currencyHits++;

      const numCheck = parseNumericPriceCell(rawVal);
      const isPureNumeric =
        typeof rawVal === 'number' ||
        /^[৳$€£]?\s*\d[\d,]*(\.\d+)?\s*(tk\.?|bdt|\/-)?$/i.test(str);

      if (isPureNumeric && numCheck.valid && !numCheck.empty) {
        st.numCount++;
        st.numValues.push(numCheck.value);
        if (prevNum !== null && numCheck.value === prevNum + 1) {
          st.sequentialMatches++;
        }
        prevNum = numCheck.value;
      } else {
        const low = str.toLowerCase();
        st.textValues.push(str);
        st.uniqueTexts.add(low);
        if (KNOWN_UNIT_WORDS.has(low)) st.unitHits++;
        if (/^[a-z]{1,5}[-_/]\d{2,6}[a-z0-9-]*$/i.test(str)) st.codeHits++;
        if (matchesKnownCategoryText(str, knownCategoryLowerSet)) st.catHits++;
        if (hasConductorOrModelItemSpec(str)) {
          st.cableSizeHits++;
        }
      }
    }

    if (st.nonEmpty > 0) {
      colStatsList.push(st);
    }
  }

  // 2a. Infer Serial Column (sequential 1, 2, 3...)
  if (columns.serial === -1) {
    const serialCand = colStatsList.find(
      (st) =>
        st.numCount >= 3 &&
        st.numCount / st.nonEmpty >= 0.8 &&
        st.sequentialMatches >= Math.max(2, Math.floor((st.numCount - 1) * 0.65)) &&
        st.currencyHits === 0
    );
    if (serialCand) {
      columns.serial = serialCand.col;
      assignedCols.add(serialCand.col);
    }
  }

  // 2b. Infer Unit Column ("Coils", "Meters", "Bobin", "Pcs")
  if (columns.unit === -1) {
    const unitCand = colStatsList.find(
      (st) => !assignedCols.has(st.col) && st.nonEmpty >= 2 && st.unitHits / st.nonEmpty >= 0.6
    );
    if (unitCand) {
      columns.unit = unitCand.col;
      assignedCols.add(unitCand.col);
    }
  }

  // 2c. Infer Item Code Column ("PC-101")
  if (columns.code === -1) {
    const codeCand = colStatsList.find(
      (st) => !assignedCols.has(st.col) && st.nonEmpty >= 2 && st.codeHits / st.nonEmpty >= 0.65
    );
    if (codeCand) {
      columns.code = codeCand.col;
      assignedCols.add(codeCand.col);
    }
  }

  // 2d. Infer Category vs Item Name among remaining text columns
  const remainingTextCols = colStatsList.filter(
    (st) => !assignedCols.has(st.col) && st.textValues.length >= Math.max(1, st.nonEmpty * 0.5)
  );

  if (columns.category === -1 && remainingTextCols.length >= (columns.name === -1 ? 2 : 1)) {
    const catCand = remainingTextCols.find((st) => {
      const catRatio = st.catHits / st.textValues.length;
      const uniqueRatio = st.uniqueTexts.size / st.textValues.length;
      // Either matches known cable categories strongly, or repeats group names while another column has unique item names
      return (
        catRatio >= 0.45 &&
        (st.textValues.length <= 3 || uniqueRatio <= 0.75 || columns.name !== -1)
      );
    });
    if (catCand) {
      columns.category = catCand.col;
      assignedCols.add(catCand.col);
    }
  }

  if (columns.name === -1) {
    const nameCandidates = colStatsList.filter(
      (st) => !assignedCols.has(st.col) && st.textValues.length > 0
    );
    if (nameCandidates.length > 0) {
      // Score by uniqueness + cable size presence + text richness (never picking repeated category over unique item names!)
      nameCandidates.sort((a, b) => {
        const scoreA = a.uniqueTexts.size * 3 + a.cableSizeHits * 4 + a.textValues.length;
        const scoreB = b.uniqueTexts.size * 3 + b.cableSizeHits * 4 + b.textValues.length;
        return scoreB - scoreA;
      });
      const bestCand = nameCandidates[0];

      // Inspect whether a headerless sheet is actually an unrecognized non-item table (e.g. Client | City | Balance)
      const totalDomainSignals = colStatsList.reduce(
        (sum, st) => sum + st.cableSizeHits + st.catHits + st.codeHits + st.unitHits,
        0
      );
      const inferredNumCandidate = colStatsList.find(
        (st) =>
          !assignedCols.has(st.col) &&
          st.col !== bestCand.col &&
          st.numCount >= Math.max(1, Math.floor(st.nonEmpty * 0.5)) &&
          st.numValues.length > 0
      );
      const firstNonEmptyIdx = rawRows.findIndex(
        (r) => Array.isArray(r) && r.some((c) => c !== undefined && c !== null && String(c).trim() !== '')
      );
      const firstRow = firstNonEmptyIdx !== -1 ? rawRows[firstNonEmptyIdx] : undefined;
      const firstRateRaw = firstRow && inferredNumCandidate ? firstRow[inferredNumCandidate.col] : undefined;
      const firstRateStr = firstRateRaw !== undefined && firstRateRaw !== null ? String(firstRateRaw).trim() : '';
      const firstRateParsed = parseNumericPriceCell(firstRateRaw);
      const firstRateCellIsTextHeader = Boolean(firstRateStr) && (!firstRateParsed.valid || firstRateParsed.empty);
      const firstNameStr = firstRow ? String(firstRow[bestCand.col] ?? '').trim() : '';

      const isOnlyUnrecognizedHeaderRow =
        columns.headerRowIndex === -1 &&
        rawRows.length >= 2 &&
        bestCand.textValues.length === 1 &&
        bestCand.numCount >= 1 &&
        bestCand.cableSizeHits === 0;

      const isUnrecognizedHeaderlessTable =
        columns.headerRowIndex === -1 &&
        !overrideColumns?.name &&
        totalDomainSignals === 0 &&
        (!inferredNumCandidate || firstRateCellIsTextHeader);

      if (!isOnlyUnrecognizedHeaderRow && !isUnrecognizedHeaderlessTable) {
        columns.name = bestCand.col;
        assignedCols.add(bestCand.col);
        // If headerless sheet HAS real cable rows below row 0 while row 0 has an unrecognized text header in the rate column, skip row 0
        if (
          columns.headerRowIndex === -1 &&
          firstNonEmptyIdx !== -1 &&
          firstRateCellIsTextHeader &&
          !hasConductorOrModelItemSpec(firstNameStr)
        ) {
          columns.dataStartRow = firstNonEmptyIdx + 1;
        }
      }
    }
  }

  // 2e. Infer Category if still unset and another unassigned text column clearly holds repeated group labels
  if (columns.category === -1) {
    const afterNameTextCols = colStatsList.filter(
      (st) => !assignedCols.has(st.col) && st.textValues.length >= 2
    );
    const catAfter = afterNameTextCols.find(
      (st) =>
        st.catHits / st.textValues.length >= 0.35 ||
        (st.textValues.length >= 5 && st.uniqueTexts.size / st.textValues.length <= 0.4 && st.cableSizeHits === 0)
    );
    if (catAfter) {
      columns.category = catAfter.col;
      assignedCols.add(catAfter.col);
    }
  }

  // 2f. Infer Price / Rate (and Opening Stock) from remaining unassigned numeric columns
  if (columns.rate === -1) {
    const numCandidates = colStatsList.filter(
      (st) => !assignedCols.has(st.col) && st.numCount >= Math.max(1, Math.floor(st.nonEmpty * 0.5)) && st.numValues.length > 0
    );
    if (numCandidates.length === 1) {
      columns.rate = numCandidates[0].col;
      assignedCols.add(numCandidates[0].col);
    } else if (numCandidates.length >= 2) {
      // Column with currency symbols or higher median/average magnitude is Rate; smaller integer column is Opening Stock
      const withAvg = numCandidates.map((st) => {
        const positiveVals = st.numValues.filter((v) => v > 0);
        const avg = positiveVals.length > 0 ? positiveVals.reduce((s, v) => s + v, 0) / positiveVals.length : 0;
        return { st, avg };
      });
      withAvg.sort((a, b) => {
        if (b.st.currencyHits !== a.st.currencyHits) return b.st.currencyHits - a.st.currencyHits;
        return b.avg - a.avg;
      });
      columns.rate = withAvg[0].st.col;
      assignedCols.add(withAvg[0].st.col);

      if (columns.opening === -1 && withAvg[1] && withAvg[0].avg >= 100 && withAvg[1].avg < withAvg[0].avg * 0.5) {
        columns.opening = withAvg[1].st.col;
        assignedCols.add(withAvg[1].st.col);
      }
    }
  }

  // 2g. Smart Category-vs-Item Column Validation:
  // In cable price sheets, a column titled "Description" / "Name of Cable" / "Item" often holds the cable category
  // (e.g. "(H.T XLPE Cable) (Copper Tape Screen)"), while the "Size" / "Cable Size" / "Spec" column holds actual item names ("1 x 35 rm").
  const inspectColumnContent = (colIdx: number) => {
    let nonEmptyText = 0;
    let catHits = 0;
    let itemSizeHits = 0;
    const uniqueSet = new Set<string>();
    if (colIdx < 0 || colIdx >= maxCols) {
      return { nonEmptyText, catHits, itemSizeHits, uniqueCount: 0 };
    }
    const maxScan = Math.min(rawRows.length, columns.dataStartRow + 150);
    for (let r = columns.dataStartRow; r < maxScan; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;
      const cell = row[colIdx];
      if (cell === undefined || cell === null) continue;
      const str = cleanCategoryLabel(String(cell));
      if (!str || str === '-' || str === '—') continue;
      if (JUNK_ROW_PHRASES.has(str.toLowerCase())) continue;
      if (/^[৳$€£]?\s*\d[\d,]*(\.\d+)?\s*(tk\.?|bdt|\/-)?$/i.test(str)) continue;

      nonEmptyText++;
      uniqueSet.add(str.toLowerCase());
      if (isPureCableCategoryLabel(str, knownCategoryLowerSet)) catHits++;
      if (hasConductorOrModelItemSpec(str)) itemSizeHits++;
    }
    return { nonEmptyText, catHits, itemSizeHits, uniqueCount: uniqueSet.size };
  };

  if (columns.name !== -1) {
    const nameProf = inspectColumnContent(columns.name);
    const nameIsCategoryColumn =
      nameProf.nonEmptyText >= 1 &&
      nameProf.itemSizeHits === 0 &&
      nameProf.catHits >= Math.max(1, Math.ceil(nameProf.nonEmptyText * 0.5));

    if (columns.spec !== -1) {
      const specProf = inspectColumnContent(columns.spec);
      const specHasRealCableItems =
        specProf.itemSizeHits >= 1 &&
        (nameIsCategoryColumn ||
          (nameProf.itemSizeHits === 0 && specProf.itemSizeHits >= 2 && nameProf.uniqueCount <= specProf.uniqueCount));

      if (specHasRealCableItems) {
        if (columns.category === -1 && (nameProf.catHits >= 1 || nameProf.nonEmptyText >= 1)) {
          columns.category = columns.name;
        }
        columns.name = columns.spec;
        columns.spec = -1;
      }
    } else if (nameIsCategoryColumn) {
      let bestAltCol = -1;
      let bestAltScore = 0;
      for (let c = 0; c < maxCols; c++) {
        if (
          c === columns.name ||
          c === columns.category ||
          c === columns.serial ||
          c === columns.rate ||
          c === columns.opening ||
          c === columns.unit
        ) {
          continue;
        }
        const prof = inspectColumnContent(c);
        if (prof.itemSizeHits >= 1) {
          const sc = prof.itemSizeHits * 4 + prof.uniqueCount * 2 + prof.nonEmptyText;
          if (sc > bestAltScore) {
            bestAltScore = sc;
            bestAltCol = c;
          }
        }
      }
      if (bestAltCol !== -1) {
        if (columns.category === -1) {
          columns.category = columns.name;
        }
        if (columns.code === bestAltCol) columns.code = -1;
        if (columns.remarks === bestAltCol) columns.remarks = -1;
        columns.name = bestAltCol;
      }
    } else if (nameProf.nonEmptyText === 0 && columns.spec !== -1) {
      const specProf = inspectColumnContent(columns.spec);
      if (specProf.nonEmptyText >= 1) {
        columns.name = columns.spec;
        columns.spec = -1;
      }
    }
  } else if (columns.spec !== -1) {
    columns.name = columns.spec;
    columns.spec = -1;
  }

  // Apply explicit user column overrides (from BulkItemUploadModal column mapper) if provided
  if (overrideColumns) {
    (['serial', 'code', 'name', 'category', 'spec', 'unit', 'rate', 'opening', 'minStock', 'remarks'] as const).forEach((key) => {
      if (overrideColumns[key] !== undefined) {
        columns[key] = overrideColumns[key]!;
      }
    });
  }

  // Build readable header labels for UI column mapping dropdowns
  const headerLabels: string[] = [];
  for (let c = 0; c < maxCols; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    const hdrText =
      columns.headerRowIndex !== -1 && rawRows[columns.headerRowIndex]?.[c] !== undefined
        ? String(rawRows[columns.headerRowIndex][c] ?? '').replace(/[\r\n\t]+/g, ' ').trim()
        : '';
    headerLabels.push(hdrText ? `Col ${colLetter}: ${hdrText}` : `Column ${colLetter}`);
  }

  // Check if sheet name itself matches a known category (e.g., workbook with tabs per category: "BYA", "Flexible")
  let sheetFallbackCategory = '';
  const cleanSheetName = cleanCategoryLabel(sheetName);
  if (
    cleanSheetName &&
    !/^(sheet\s*\d*|items?|price.*|catalog.*|csv|pasted.*|data|master.*|item_directory|stock.*)$/i.test(cleanSheetName) &&
    matchesKnownCategoryText(cleanSheetName, knownCategoryLowerSet)
  ) {
    const exactMatch = knownCategories.find((kc) => kc.toLowerCase() === cleanSheetName.toLowerCase());
    sheetFallbackCategory = exactMatch || cleanSheetName;
  }

  const parsedRows: ParsedSheetItemRow[] = [];
  let currentSectionCategory = '';
  let hasItemsUnderCurrentBanner = false;
  const isMultiColSheet =
    maxCols >= 2 &&
    (columns.rate !== -1 || columns.serial !== -1 || columns.unit !== -1 || columns.opening !== -1 || columns.code !== -1);

  // If headerless sheet had unrecognized column headers and no valid name column was inferred, abort before parsing fake row 0 header
  if (columns.name === -1 && columns.spec === -1) {
    const firstNonEmptyRow = rawRows.find(
      (r) => Array.isArray(r) && r.some((c) => c !== undefined && c !== null && String(c).trim() !== '')
    );
    const sampleHeaders = Array.isArray(firstNonEmptyRow)
      ? firstNonEmptyRow
          .map((c) => String(c ?? '').replace(/[\r\n\t]+/g, ' ').trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
    issues.push({
      sheetName,
      rowNumber: 1,
      itemName: sheetName,
      problem: `Could not recognize an Item Name / Description column${sampleHeaders.length > 0 ? ` (found: ${sampleHeaders.join(', ')})` : ''} in sheet "${sheetName}".`,
      howToFix:
        'Include an Item Name column (Item Name, Name, Product, Particulars, Description, or Cable Size) and a Price column (Price, Rate, MRP, TP, DP, or Amount), or use the column mapper dropdowns.',
      severity: 'error'
    });
    return { columns, headerLabels, rows: [], issues };
  }

  for (let i = columns.dataStartRow; i < rawRows.length; i++) {
    const row = rawRows[i];
    const excelRowNumber = i + 1;
    if (!row || !Array.isArray(row)) continue;

    const nonEmptyEntries = row
      .map((cell, idx) => ({ idx, val: cell !== undefined && cell !== null ? cleanCategoryLabel(String(cell)) : '' }))
      .filter((e) => e.val !== '');

    if (nonEmptyEntries.length === 0) continue;

    // Detect repeated header rows mid-sheet (common in multi-page Excel exports)
    const rowRoles = row.map((c) => classifyHeaderCell(c)).filter((rl) => rl !== null);
    if (rowRoles.length >= 2 && !row.some((c) => looksLikeCableDataCell(normalizeHeaderText(c)))) {
      continue;
    }

    // Detect Subtotal / Grand Total / Company Title / Footer banner rows and skip them cleanly
    const joinedRowLower = nonEmptyEntries.map((e) => e.val.toLowerCase()).join(' | ');
    if (
      /^(subtotal|sub total|grand total|grand warehouse total|total\s*:|poly cables ind|madhupur sales center|stock serial report|period\s*:)/i.test(
        nonEmptyEntries[0].val.trim()
      ) ||
      joinedRowLower.includes('grand warehouse total') ||
      joinedRowLower.includes('subtotal (')
    ) {
      continue;
    }

    // Detect Category Section & Sub-Section Banner Rows (e.g., "(H.T XLPE Cable) (Copper Tape Screen)",
    // consecutive "(H.T XLPE Cable)" + "(Copper Tape Screen)" rows, or multi-cell category headers with empty/zero price & stock)
    const rowRateCheck =
      columns.rate !== -1 && row[columns.rate] !== undefined ? parseNumericPriceCell(row[columns.rate]) : { value: 0, valid: true, empty: true };
    const rowStockCheck =
      columns.opening !== -1 && row[columns.opening] !== undefined ? parseNumericPriceCell(row[columns.opening]) : { value: 0, valid: true, empty: true };
    const rowHasPositiveRateOrStock =
      (rowRateCheck.valid && !rowRateCheck.empty && rowRateCheck.value > 0) ||
      (rowStockCheck.valid && !rowStockCheck.empty && rowStockCheck.value > 0);
    const rowHasItemSpec = nonEmptyEntries.some(
      (e) => e.idx !== columns.serial && e.idx !== columns.code && hasConductorOrModelItemSpec(e.val)
    );

    const hasExplicitProductCodeOrSerial =
      (columns.code !== -1 && row[columns.code] !== undefined && String(row[columns.code]).trim() !== '' && !JUNK_ROW_PHRASES.has(String(row[columns.code]).trim().toLowerCase())) ||
      (columns.serial !== -1 && row[columns.serial] !== undefined && String(row[columns.serial]).trim() !== '' && !isNaN(parseInt(String(row[columns.serial]), 10)));

    if (!rowHasPositiveRateOrStock && !rowHasItemSpec && !hasExplicitProductCodeOrSerial) {
      const uniqueRowTexts = Array.from(new Set(nonEmptyEntries.map((e) => e.val)));
      const descriptiveParts: string[] = [];
      const seenPartLower = new Set<string>();

      for (const entry of nonEmptyEntries) {
        if (entry.idx === columns.serial && nonEmptyEntries.length > 1) continue;
        const v = entry.val;
        const vLow = v.toLowerCase();
        if (v === '-' || v === '—' || v === '0') continue;
        // Skip short section/serial markers like "1", "05", "A", "B.", "(i)" when another descriptive cell exists
        if (nonEmptyEntries.length > 1 && /^(?:\d{1,3}|[a-z]|[ivx]{1,4})[.)]?$/i.test(v)) continue;
        if (KNOWN_UNIT_WORDS.has(vLow)) continue;
        if (!seenPartLower.has(vLow)) {
          seenPartLower.add(vLow);
          descriptiveParts.push(v);
        }
      }

      const bannerCandidate = cleanCategoryLabel(descriptiveParts.join(' '));
      const isRecognizedCategoryBanner =
        Boolean(bannerCandidate) && isPureCableCategoryLabel(bannerCandidate, knownCategoryLowerSet);

      let isGenericSingleTextBanner = false;
      if (!isRecognizedCategoryBanner && isMultiColSheet && uniqueRowTexts.length === 1 && bannerCandidate) {
        const rateCellStr = columns.rate !== -1 && row[columns.rate] !== undefined ? cleanCategoryLabel(String(row[columns.rate])) : '';
        const unitCellStr = columns.unit !== -1 && row[columns.unit] !== undefined ? cleanCategoryLabel(String(row[columns.unit])) : '';
        const stockCellStr = columns.opening !== -1 && row[columns.opening] !== undefined ? cleanCategoryLabel(String(row[columns.opening])) : '';
        const serialCellStr = columns.serial !== -1 && row[columns.serial] !== undefined ? cleanCategoryLabel(String(row[columns.serial])) : '';

        const rateIsEmptyOrSame = !rateCellStr || rateCellStr === '-' || rateCellStr === uniqueRowTexts[0];
        const unitIsEmptyOrSame = !unitCellStr || unitCellStr === '-' || unitCellStr === uniqueRowTexts[0];
        const stockIsEmptyOrSame = !stockCellStr || stockCellStr === '-' || stockCellStr === uniqueRowTexts[0];
        const serialIsEmptyOrSame = !serialCellStr || serialCellStr === uniqueRowTexts[0];

        if (
          rateIsEmptyOrSame &&
          unitIsEmptyOrSame &&
          stockIsEmptyOrSame &&
          serialIsEmptyOrSame &&
          !/^\d+(\.\d+)?$/.test(bannerCandidate) &&
          !JUNK_ROW_PHRASES.has(bannerCandidate.toLowerCase())
        ) {
          isGenericSingleTextBanner = true;
        }
      }

      if (isRecognizedCategoryBanner || isGenericSingleTextBanner) {
        const matchedStandardCat =
          knownCategories.find((kc) => kc.toLowerCase() === bannerCandidate.toLowerCase()) || bannerCandidate;

        if (
          currentSectionCategory &&
          !hasItemsUnderCurrentBanner &&
          isSubCategoryQualifier(matchedStandardCat) &&
          !currentSectionCategory.toLowerCase().includes(matchedStandardCat.toLowerCase())
        ) {
          currentSectionCategory = `${currentSectionCategory} ${matchedStandardCat}`.trim();
        } else {
          currentSectionCategory = matchedStandardCat;
        }
        hasItemsUnderCurrentBanner = false;
        saveCustomCategory(currentSectionCategory);
        continue;
      }
    }

    let rawNameCell =
      columns.name !== -1 && row[columns.name] !== undefined && row[columns.name] !== null
        ? cleanCategoryLabel(String(row[columns.name]))
        : '';

    // Fallback scan across the row if the mapped Name cell was blank
    if (!rawNameCell) {
      for (let c = 0; c < row.length; c++) {
        if (
          c === columns.serial ||
          c === columns.code ||
          c === columns.rate ||
          c === columns.opening ||
          c === columns.unit ||
          c === columns.category
        ) {
          continue;
        }
        const cellVal = cleanCategoryLabel(String(row[c] ?? ''));
        const cleanedNum = cellVal.replace(/[৳,\s]|tk\.?|\/-/gi, '');
        if (cellVal && !/^\d+(\.\d+)?$/.test(cleanedNum) && !JUNK_ROW_PHRASES.has(cellVal.toLowerCase())) {
          rawNameCell = cellVal;
          break;
        }
      }
    }

    if (!rawNameCell) {
      const codeVal = columns.code !== -1 && row[columns.code] !== undefined ? String(row[columns.code]).trim() : '';
      const specVal = columns.spec !== -1 && row[columns.spec] !== undefined ? cleanCategoryLabel(String(row[columns.spec])) : '';
      if (codeVal && !JUNK_ROW_PHRASES.has(codeVal.toLowerCase())) {
        rawNameCell = codeVal;
      } else if (specVal && !JUNK_ROW_PHRASES.has(specVal.toLowerCase())) {
        rawNameCell = specVal;
      } else if (nonEmptyEntries.length > 0) {
        rawNameCell = `Item #${excelRowNumber}`;
      } else {
        continue;
      }
    }

    const lowerName = rawNameCell.toLowerCase().trim();
    if (JUNK_ROW_PHRASES.has(lowerName)) continue;
    if (
      lowerName.includes('poly cables ind') ||
      lowerName.includes('madhupur sales') ||
      lowerName.includes('holding no') ||
      lowerName.startsWith('subtotal') ||
      lowerName.startsWith('grand total')
    ) {
      continue;
    }

    let cleanName = rawNameCell.trim();
    if (JUNK_ROW_PHRASES.has(cleanName.toLowerCase())) continue;

    // Extract Serial (from serial column or from item name prefix if available)
    let rawSerial: number | string | undefined = undefined;
    if (columns.serial !== -1 && row[columns.serial] !== undefined && row[columns.serial] !== null) {
      const sVal = String(row[columns.serial]).trim();
      if (sVal) {
        const numVal = parseInt(sVal, 10);
        rawSerial = !isNaN(numVal) ? numVal : sVal;
      }
    }
    if (rawSerial === undefined && !isCableSpecificationStart(cleanName)) {
      const m = cleanName.match(/^0*(\d{1,4})(?:[.)\-])\s*(?=[a-zA-Z]|\d+\s*(?:x|\*|\/|\.|pair|rm|re|bya|sq|flexible|coils|mtr))/i);
      if (m && !/^\d+\.\d+\s*(rm|re|sq|mm)/i.test(cleanName)) {
        rawSerial = parseInt(m[1], 10);
      }
    }

    // Strip leading serial from item name so item name does NOT show serial
    cleanName = cleanItemNameDisplay(cleanName, rawSerial);

    // Extract Item Code (strictly from code column — never serial number!)
    let rawCode =
      columns.code !== -1 && row[columns.code] !== undefined && row[columns.code] !== null
        ? String(row[columns.code]).trim()
        : '';

    // Extract Size / Spec
    let specVal =
      columns.spec !== -1 && row[columns.spec] !== undefined && row[columns.spec] !== null
        ? cleanCategoryLabel(String(row[columns.spec]))
        : '';

    // Extract explicit Category cell (and carry forward across vertically merged / grouped rows)
    let explicitCatCell =
      columns.category !== -1 && row[columns.category] !== undefined && row[columns.category] !== null
        ? cleanCategoryLabel(String(row[columns.category]))
        : '';
    if (explicitCatCell && JUNK_ROW_PHRASES.has(explicitCatCell.toLowerCase())) {
      explicitCatCell = '';
    }

    // Extract Remarks early so we can also check if an unmapped size cell landed elsewhere
    let remarksVal =
      columns.remarks !== -1 && row[columns.remarks] !== undefined && row[columns.remarks] !== null
        ? String(row[columns.remarks]).trim()
        : '';

    // Row-Level Safeguard: NEVER allow a pure Cable Category label like "(H.T XLPE Cable) (Copper Tape Screen)"
    // to sit in the Item Name field!
    if (isPureCableCategoryLabel(cleanName, knownCategoryLowerSet)) {
      let replacementItemName = '';
      let usedSpecCol = false;
      let usedOtherCol = -1;

      if (specVal && !isPureCableCategoryLabel(specVal, knownCategoryLowerSet) && !JUNK_ROW_PHRASES.has(specVal.toLowerCase())) {
        replacementItemName = specVal;
        usedSpecCol = true;
      } else {
        for (let c = 0; c < row.length; c++) {
          if (
            c === columns.name ||
            c === columns.category ||
            c === columns.serial ||
            c === columns.rate ||
            c === columns.opening ||
            c === columns.unit
          ) {
            continue;
          }
          const cand = cleanCategoryLabel(String(row[c] ?? ''));
          if (cand && hasConductorOrModelItemSpec(cand) && !isPureCableCategoryLabel(cand, knownCategoryLowerSet)) {
            replacementItemName = cand;
            usedOtherCol = c;
            break;
          }
        }
      }

      if (replacementItemName) {
        const categoryFromName = cleanName;
        cleanName = replacementItemName;
        if (usedSpecCol) specVal = '';
        if (usedOtherCol !== -1) {
          if (usedOtherCol === columns.code) rawCode = '';
          if (usedOtherCol === columns.remarks) remarksVal = '';
        }
        explicitCatCell =
          explicitCatCell && explicitCatCell.toLowerCase() !== categoryFromName.toLowerCase()
            ? `${explicitCatCell} ${categoryFromName}`.trim()
            : categoryFromName;
      } else {
        // Pure category header / group row with no item specification on the row -> record as section category and skip!
        const matchedCat =
          knownCategories.find((kc) => kc.toLowerCase() === cleanName.toLowerCase()) || cleanName;
        if (
          currentSectionCategory &&
          !hasItemsUnderCurrentBanner &&
          isSubCategoryQualifier(matchedCat) &&
          !currentSectionCategory.toLowerCase().includes(matchedCat.toLowerCase())
        ) {
          currentSectionCategory = `${currentSectionCategory} ${matchedCat}`.trim();
        } else {
          currentSectionCategory = matchedCat;
        }
        hasItemsUnderCurrentBanner = false;
        saveCustomCategory(currentSectionCategory);
        continue;
      }
    }

    if (explicitCatCell) {
      currentSectionCategory = explicitCatCell;
      saveCustomCategory(explicitCatCell);
    }

    // Resolve Category (Explicit Category Column -> Section Banner Category -> Sheet Tab Category -> Smart Cable Auto-Categorizer)
    const hasExplicitCategory = Boolean(explicitCatCell || currentSectionCategory || sheetFallbackCategory);
    let resolvedCategory = explicitCatCell || currentSectionCategory || sheetFallbackCategory;
    if (resolvedCategory) {
      const matchedKnown = knownCategories.find((kc) => kc.toLowerCase() === resolvedCategory.toLowerCase());
      if (matchedKnown) resolvedCategory = matchedKnown;
    } else {
      resolvedCategory = categorizeCableItem(cleanName, specVal);
    }

    // Extract Unit
    const explicitUnitCell =
      columns.unit !== -1 && row[columns.unit] !== undefined && row[columns.unit] !== null
        ? String(row[columns.unit]).trim()
        : '';
    const hasExplicitUnit = Boolean(explicitUnitCell);
    const unitVal = normalizeUnitValue(explicitUnitCell, cleanName);

    // Extract Price / Rate
    let rateVal = 0;
    let hasExplicitRate = false;
    if (columns.rate !== -1 && row[columns.rate] !== undefined && row[columns.rate] !== null) {
      const rawRateCell = row[columns.rate];
      const parsedPrice = parseNumericPriceCell(rawRateCell);
      if (!parsedPrice.empty) {
        if (!parsedPrice.valid) {
          issues.push({
            sheetName,
            rowNumber: excelRowNumber,
            itemName: cleanName,
            problem: `Invalid price value "${String(rawRateCell).trim()}" in Row ${excelRowNumber} — imported "${cleanName}" with ৳0 price.`,
            howToFix: `Replace "${String(rawRateCell).trim()}" in Row ${excelRowNumber} with a plain number (e.g. 3620), or update its price in Master Item Directory.`,
            severity: 'warning'
          });
        } else {
          rateVal = parsedPrice.value;
          hasExplicitRate = true;
        }
      }
    }

    // Extract Opening Stock
    let stockVal = 0;
    let hasExplicitStock = false;
    if (columns.opening !== -1 && row[columns.opening] !== undefined && row[columns.opening] !== null) {
      const rawStockStr = String(row[columns.opening]).trim();
      if (rawStockStr !== '' && rawStockStr !== '-' && rawStockStr !== '—') {
        const parsedStock = parseFloat(rawStockStr.replace(/[^\d.-]/g, ''));
        if (isNaN(parsedStock)) {
          issues.push({
            sheetName,
            rowNumber: excelRowNumber,
            itemName: cleanName,
            problem: `Invalid opening stock value "${rawStockStr}" in Row ${excelRowNumber} — defaulted stock to 0.`,
            howToFix: `Enter a numeric quantity in the Opening Stock column for "${cleanName}".`,
            severity: 'warning'
          });
        } else {
          stockVal = Math.max(0, parsedStock);
          hasExplicitStock = true;
        }
      }
    }

    // Extract Min Stock Alert
    let minStockVal: number | undefined = undefined;
    if (columns.minStock !== -1 && row[columns.minStock] !== undefined && row[columns.minStock] !== null) {
      const rawMin = String(row[columns.minStock]).trim();
      if (rawMin) {
        const numMin = parseFloat(rawMin.replace(/[^\d.-]/g, ''));
        if (!isNaN(numMin)) minStockVal = Math.max(0, numMin);
      }
    }

    hasItemsUnderCurrentBanner = true;

    parsedRows.push({
      excelRowNumber,
      serial: rawSerial,
      code: rawCode,
      name: cleanName,
      category: resolvedCategory,
      hasExplicitCategory,
      sizeSpec: specVal,
      unit: unitVal,
      hasExplicitUnit,
      rate: rateVal,
      hasExplicitRate,
      openingStock: stockVal,
      hasExplicitStock,
      minStockAlert: minStockVal,
      remarks: remarksVal
    });
  }

  if (parsedRows.length === 0) {
    const firstNonEmptyRow = rawRows.find(
      (r) => Array.isArray(r) && r.some((c) => c !== undefined && c !== null && String(c).trim() !== '')
    );
    const sampleHeaders = Array.isArray(firstNonEmptyRow)
      ? firstNonEmptyRow
          .map((c) => String(c ?? '').replace(/[\r\n\t]+/g, ' ').trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const unrecognizedProblem =
      columns.name === -1
        ? `Could not recognize an Item Name / Description column${sampleHeaders.length > 0 ? ` (found: ${sampleHeaders.join(', ')})` : ''} in sheet "${sheetName}".`
        : `Zero valid item rows found in sheet "${sheetName}".`;
    issues.push({
      sheetName,
      rowNumber: columns.headerRowIndex !== -1 ? columns.headerRowIndex + 1 : 1,
      itemName: sheetName,
      problem: unrecognizedProblem,
      howToFix:
        'Include an Item Name column (Item Name, Name, Product, Particulars, Description, or Cable Size) and a Price column (Price, Rate, MRP, TP, DP, or Amount), or use the column mapper dropdowns.',
      severity: 'error'
    });
  } else if (columns.rate === -1 && overrideColumns?.rate !== -1) {
    issues.push({
      sheetName,
      rowNumber: columns.headerRowIndex !== -1 ? columns.headerRowIndex + 1 : 1,
      itemName: sheetName,
      problem: `Missing Price / Rate column in sheet "${sheetName}" — no Price, Rate, Unit Price, MRP, TP, DP, New Price, or Amount column was detected.`,
      howToFix:
        'Select your Price column using the "Price / Rate" dropdown in Detected Excel Columns, or ensure the price column header is named "Price", "Rate", or "MRP".',
      severity: 'error'
    });
  }

  return { columns, headerLabels, rows: parsedRows, issues };
}

export interface WorkbookSheetOption {
  sheetName: string;
  rows: any[][];
  parsedRowCount: number;
  hasHeaderRow: boolean;
  priorityScore: number;
}

/**
 * Inspects all worksheets in a workbook, skips completely empty worksheets,
 * scores preferred sheet names ("Master Items", "Special Items", "Items", "Sheet1"),
 * and determines the best default worksheet selection without failing on unexpected sheet names.
 */
export function selectWorkbookSheetsForImport(
  wb: XLSX.WorkBook,
  options?: { isSpecialItemMode?: boolean }
): {
  nonEmptySheets: WorkbookSheetOption[];
  recommendedSelection: string;
} {
  const isSpecial = Boolean(options?.isSpecialItemMode);
  const nonEmptySheets: WorkbookSheetOption[] = [];

  for (const sheetName of wb.SheetNames || []) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rawSheetRows = (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]) || [];
    const hasAnyCell = rawSheetRows.some(
      (r) => Array.isArray(r) && r.some((c) => c !== undefined && c !== null && String(c).trim() !== '')
    );
    if (!hasAnyCell) continue;

    const expandedRows = expandSheetVerticalCategoryMerges(ws, rawSheetRows);
    const detection = detectAndParseItemSheetRows(expandedRows, sheetName);

    const normSheet = sheetName.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    let priorityScore = 0;
    if (isSpecial) {
      if (normSheet === 'special items' || normSheet === 'special item' || normSheet === 'special') priorityScore = 1000;
      else if (normSheet === 'items' || normSheet === 'item list' || normSheet === 'item directory') priorityScore = 500;
      else if (normSheet === 'sheet1' || normSheet === 'sheet 1') priorityScore = 400;
      else if (normSheet === 'master items' || normSheet === 'master item') priorityScore = 100;
    } else {
      if (normSheet === 'master items' || normSheet === 'master item') priorityScore = 1000;
      else if (normSheet === 'items' || normSheet === 'item list' || normSheet === 'item directory') priorityScore = 850;
      else if (normSheet === 'sheet1' || normSheet === 'sheet 1') priorityScore = 700;
      else if (normSheet === 'special items' || normSheet === 'special item') priorityScore = -50;
    }

    nonEmptySheets.push({
      sheetName,
      rows: expandedRows,
      parsedRowCount: detection.rows.length,
      hasHeaderRow: detection.columns.headerRowIndex !== -1,
      priorityScore
    });
  }

  if (nonEmptySheets.length === 0) {
    return { nonEmptySheets: [], recommendedSelection: '' };
  }

  if (nonEmptySheets.length === 1) {
    return { nonEmptySheets, recommendedSelection: nonEmptySheets[0].sheetName };
  }

  const validSheets = nonEmptySheets.filter((s) => s.parsedRowCount > 0);
  const targetPool = validSheets.length > 0 ? validSheets : nonEmptySheets;

  // Prefer explicit high-priority sheets ("Special Items", "Master Items", "Items", "Sheet1") if present & valid
  const namedPriority = [...targetPool]
    .filter((s) => s.priorityScore > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore);
  if (namedPriority.length > 0) {
    return { nonEmptySheets, recommendedSelection: namedPriority[0].sheetName };
  }

  // Check if workbook is multi-tab category-based (e.g. "BYA", "BYM", "Flexible")
  const knownCatsLower = new Set([...DEFAULT_CATEGORIES, ...getAllCategories()].map((c) => c.trim().toLowerCase()));
  const categoryTabCount = validSheets.filter((s) =>
    isPureCableCategoryLabel(cleanCategoryLabel(s.sheetName), knownCatsLower)
  ).length;
  if (validSheets.length > 1 && categoryTabCount >= Math.ceil(validSheets.length * 0.5)) {
    return { nonEmptySheets, recommendedSelection: '__ALL__' };
  }

  // Otherwise pick the first non-empty worksheet with valid rows (or first non-empty worksheet)
  return { nonEmptySheets, recommendedSelection: targetPool[0].sheetName };
}

/**
 * Parse uploaded XLSX/CSV for bulk item import with full diagnostics (takes ALL item names and reports problems + fixes)
 */
export async function parseXLSXToItemsWithDiagnostics(
  file: File,
  options?: { isSpecialItemMode?: boolean }
): Promise<{ items: Item[]; issues: ExcelItemImportIssue[] }> {
  const issues: ExcelItemImportIssue[] = [];
  let wb: XLSX.WorkBook;

  try {
    wb = await readWorkbookFromFile(file);
  } catch (err: any) {
    issues.push({
      sheetName: file.name,
      rowNumber: 1,
      itemName: file.name,
      problem: `Could not read Excel file (${err?.message || 'Unsupported or corrupted file'}).`,
      howToFix: 'Save your file as a standard Excel Workbook (.xlsx) or CSV (.csv) and upload again.',
      severity: 'error'
    });
    return { items: [], issues };
  }

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    issues.push({
      sheetName: file.name,
      rowNumber: 1,
      itemName: file.name,
      problem: 'The uploaded Excel workbook contains no worksheets.',
      howToFix: 'Add at least one worksheet with an "Item Name" column and upload again.',
      severity: 'error'
    });
    return { items: [], issues };
  }

  const { nonEmptySheets, recommendedSelection } = selectWorkbookSheetsForImport(wb, options);
  if (nonEmptySheets.length === 0) {
    issues.push({
      sheetName: wb.SheetNames[0] || file.name,
      rowNumber: 1,
      itemName: file.name,
      problem: 'All worksheets in this Excel file are empty (0 non-empty rows).',
      howToFix: 'Populate at least one worksheet with Item Name and Price/Rate columns and upload again.',
      severity: 'error'
    });
    return { items: [], issues };
  }

  const sheetsToProcess =
    recommendedSelection === '__ALL__'
      ? nonEmptySheets
      : nonEmptySheets.filter((s) => s.sheetName === recommendedSelection);

  const allParsedItems: Item[] = [];
  const seenCompositeKeys = new Map<string, number>();
  const seenNameCounts = new Map<string, number>();

  for (const sheetEntry of sheetsToProcess) {
    const { sheetName, rows: rawRows } = sheetEntry;
    const { rows: sheetItems, issues: sheetIssues } = detectAndParseItemSheetRows(rawRows, sheetName);
    issues.push(...sheetIssues);

    for (const row of sheetItems) {
      if (row.hasExplicitCategory && row.category) {
        saveCustomCategory(row.category);
      }

      let effectiveName = row.name;
      const cleanLowerName = row.name.toLowerCase().trim();
      const compositeKey = `${row.name.toLowerCase()}|${row.category.toLowerCase()}|${row.sizeSpec.toLowerCase()}`;
      
      // If duplicate name found across sheets or file, append category name to prevent collapsing
      if (seenNameCounts.has(cleanLowerName) || seenCompositeKeys.has(compositeKey)) {
        const count = seenNameCounts.get(cleanLowerName) || 1;
        const catSuffix = row.category ? ` (${row.category})` : '';
        if (catSuffix && !effectiveName.toLowerCase().includes(row.category.toLowerCase())) {
          effectiveName = `${effectiveName}${catSuffix}`;
        } else if (row.sizeSpec && !effectiveName.toLowerCase().includes(row.sizeSpec.toLowerCase())) {
          effectiveName = `${effectiveName} (${row.sizeSpec})`;
        } else {
          effectiveName = `${effectiveName} #${count + 1}`;
        }
        seenNameCounts.set(cleanLowerName, count + 1);

        issues.push({
          sheetName,
          rowNumber: row.excelRowNumber,
          itemName: row.name,
          problem: `"${row.name}" is duplicated on Row ${row.excelRowNumber}. Appended category to import as a distinct product.`,
          howToFix: `Item preserved as "${effectiveName}".`,
          severity: 'warning'
        });
      } else {
        seenNameCounts.set(cleanLowerName, 1);
      }

      const itemSerial = row.serial !== undefined ? row.serial : allParsedItems.length + 1;
      seenCompositeKeys.set(compositeKey, row.excelRowNumber);
      allParsedItems.push({
        id: `imported-${Date.now()}-${allParsedItems.length}`,
        code: row.code || `PC-${100 + allParsedItems.length + 1}`,
        name: effectiveName,
        sizeSpec: row.sizeSpec,
        unit: row.unit || 'Coils',
        rate: row.rate,
        category: row.category || categorizeCableItem(row.name, row.sizeSpec),
        openingStock: row.openingStock,
        hasExplicitStock: row.hasExplicitStock,
        serial: itemSerial,
        serialNo: itemSerial,
        order: typeof itemSerial === 'number' ? itemSerial : allParsedItems.length + 1,
        ...(row.hasExplicitCategory ? ({ hasExplicitCategory: true } as Partial<Item>) : {}),
        ...(row.hasExplicitUnit ? ({ hasExplicitUnit: true } as Partial<Item>) : {}),
        remarks: row.remarks || undefined
      });
    }
  }

  if (allParsedItems.length === 0 && !issues.some((iss) => iss.severity === 'error')) {
    issues.push({
      sheetName: sheetsToProcess[0]?.sheetName || wb.SheetNames[0] || file.name,
      rowNumber: 1,
      itemName: file.name,
      problem: 'No valid item rows or recognized item columns were found in this Excel file.',
      howToFix: 'Ensure a column header like "Item Name", "Name", "Product", "Particulars", "Description", or "Cable Size" has product rows and upload again.',
      severity: 'error'
    });
  }

  return { items: allParsedItems, issues };
}

export async function parseXLSXToItems(file: File): Promise<Item[]> {
  const { items } = await parseXLSXToItemsWithDiagnostics(file);
  return items;
}

/**
 * Export price update template XLSX with Previous Rate and Update Price by Effective Date
 */
export function exportPriceUpdateByEffectiveDate(
  items: Item[],
  defaultEffectiveDate: string = '10.08.26'
) {
  const formattedDate = formatDateDDMMYY(defaultEffectiveDate) || defaultEffectiveDate;
  const data = [
    ['SL #', 'Item Code', 'Item Description / Name', 'Category', 'Unit', 'Previous Rate (Tk)', 'Update Price (Tk)', 'Effective Date', 'Remarks'],
    ...items.map((item, idx) => [
      idx + 1,
      item.code || '',
      item.name || '',
      item.category || 'General',
      item.unit || 'Coils',
      item.rate,
      item.rate, // Prefilled with current/previous rate so user can easily adjust in Excel
      formattedDate,
      item.sizeSpec ? `Specs: ${item.sizeSpec}` : ''
    ])
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 8 },
    { wch: 14 },
    { wch: 42 },
    { wch: 20 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Price_Update_Sheet');
  const safeDateStr = formattedDate.replace(/[.\/-]/g, '_');
  XLSX.writeFile(wb, `Polycables_Price_Update_${safeDateStr}.xlsx`);
}

export interface PriceUpdatePreviewEntry {
  serial?: number | string;
  code: string;
  name: string;
  excelName?: string;
  catalogName?: string;
  hasNameMismatch?: boolean;
  category: string;
  unit: string;
  sizeSpec?: string;
  openingStock?: number;
  remarks?: string;
  oldRate: number;
  newRate: number;
  effectiveDate: string;
  diff: number;
  diffPercent: number;
  isChanged: boolean;
  matchedItemId?: string;
  status?: 'matched' | 'unmatched';
  matchedItem?: Item;
}

/**
 * Parse uploaded XLSX/XLS/CSV for Price Update by Effective Date.
 * Prepares both matched item updates and newly discovered items for direct catalog ingestion.
 */
export async function parseXLSXForEffectiveDatePriceUpdate(
  file: File,
  currentItems: Item[],
  overrideEffectiveDate?: string,
  options?: { isSpecialItemMode?: boolean }
): Promise<{
  updatedItems: Item[];
  updatedCount: number;
  createdCount: number;
  detectedEffectiveDate: string;
  previewList: PriceUpdatePreviewEntry[];
}> {
  const wb = await readWorkbookFromFile(file);
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('Spreadsheet file is empty.');
  }

  let detectedDateFromFile = '';
  interface ExtractedPriceRow {
    serial?: number | string;
    code: string;
    rawName: string;
    name: string;
    category: string;
    unit: string;
    sizeSpec?: string;
    openingStock?: number;
    remarks?: string;
    rate: number;
    effectiveDate: string;
    oldRate?: number;
  }

  const extractedRows: ExtractedPriceRow[] = [];
  const seenNameCounts = new Map<string, number>();

  const parseExcelCellToDDMMYY = (cellVal: any): string => {
    if (cellVal === undefined || cellVal === null || cellVal === '') return '';
    if (cellVal instanceof Date && !isNaN(cellVal.getTime())) {
      return formatDateDDMMYY(cellVal);
    }
    if (typeof cellVal === 'number' && cellVal > 20000 && cellVal < 100000) {
      try {
        const parsed = XLSX.SSF.parse_date_code(cellVal);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          const d = new Date(parsed.y, parsed.m - 1, parsed.d);
          return formatDateDDMMYY(d);
        }
      } catch {}
      const d = new Date(Math.round((cellVal - 25569) * 86400 * 1000));
      return formatDateDDMMYY(d);
    }
    const rawStr = String(cellVal).trim();
    if (!rawStr) return '';
    if (/^\d{5}$/.test(rawStr)) {
      const serialNum = Number(rawStr);
      if (serialNum > 20000 && serialNum < 100000) {
        try {
          const parsed = XLSX.SSF.parse_date_code(serialNum);
          if (parsed && parsed.y && parsed.m && parsed.d) {
            return formatDateDDMMYY(new Date(parsed.y, parsed.m - 1, parsed.d));
          }
        } catch {}
      }
    }
    const dateMatch = rawStr.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/);
    if (dateMatch) {
      const formatted = formatDateDDMMYY(dateMatch[1]);
      if (/^\d{2}\.\d{2}\.\d{2}$/.test(formatted)) return formatted;
    }
    const direct = formatDateDDMMYY(rawStr);
    return /^\d{2}\.\d{2}\.\d{2}$/.test(direct) ? direct : '';
  };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rawSheetRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    if (!rawSheetRows || rawSheetRows.length === 0) continue;

    const rawRows = expandSheetVerticalCategoryMerges(ws, rawSheetRows);
    const { columns, rows: sheetRows } = detectAndParseItemSheetRows(rawRows, sheetName);

    // Scan top banner rows (before table header) for an effective date if not already detected
    if (!detectedDateFromFile) {
      const bannerLimit = columns.headerRowIndex > 0 ? Math.min(columns.headerRowIndex, 10) : Math.min(rawRows.length, 8);
      for (let r = 0; r < bannerLimit && !detectedDateFromFile; r++) {
        const bannerRow = rawRows[r] || [];
        for (const cell of bannerRow) {
          const parsedBannerDate = parseExcelCellToDDMMYY(cell);
          if (parsedBannerDate) {
            detectedDateFromFile = parsedBannerDate;
            break;
          }
        }
      }
    }

    // Inspect detected header row for optional Previous Rate and Effective Date columns
    let prevRateIdx = -1;
    let effDateIdx = -1;
    if (columns.headerRowIndex !== -1 && rawRows[columns.headerRowIndex]) {
      const hdrs = rawRows[columns.headerRowIndex].map((h: any) =>
        String(h || '').replace(/[\r\n\t]+/g, ' ').toLowerCase().trim()
      );
      prevRateIdx = hdrs.findIndex((h: string) =>
        ['previous rate', 'prev rate', 'prev price', 'old rate', 'old price', 'current price', 'current rate'].some((k) =>
          h.includes(k)
        )
      );
      effDateIdx = hdrs.findIndex(
        (h: string) => (h.includes('effective') || h.includes('eff. date') || h === 'date') && !h.includes('update')
      );
      if (effDateIdx === -1) {
        effDateIdx = hdrs.findIndex((h: string) => h.includes('effective') || h.includes('date'));
      }
    }

    for (const rItem of sheetRows) {
      const rawRow = rawRows[rItem.excelRowNumber - 1] || [];
      const parsedPrev =
        prevRateIdx !== -1 && rawRow[prevRateIdx] !== undefined && rawRow[prevRateIdx] !== null
          ? parseNumericPriceCell(rawRow[prevRateIdx])
          : { value: 0, valid: false, empty: true };
      const rawPrevRate = parsedPrev.valid && !parsedPrev.empty ? parsedPrev.value : undefined;
      const rawDateVal =
        effDateIdx !== -1 && rawRow[effDateIdx] !== undefined && rawRow[effDateIdx] !== null
          ? rawRow[effDateIdx]
          : '';

      const formattedDateCell = parseExcelCellToDDMMYY(rawDateVal);
      if (formattedDateCell && !detectedDateFromFile) {
        detectedDateFromFile = formattedDateCell;
      }

      if (rItem.hasExplicitCategory && rItem.category) {
        saveCustomCategory(rItem.category);
      }

      let effectiveName = rItem.name;
      const cleanLowerName = rItem.name.toLowerCase().trim();
      if (seenNameCounts.has(cleanLowerName)) {
        const count = seenNameCounts.get(cleanLowerName) || 1;
        const catSuffix = rItem.category ? ` (${rItem.category})` : '';
        if (catSuffix && !effectiveName.toLowerCase().includes(rItem.category.toLowerCase())) {
          effectiveName = `${effectiveName}${catSuffix}`;
        } else if (rItem.sizeSpec && !effectiveName.toLowerCase().includes(rItem.sizeSpec.toLowerCase())) {
          effectiveName = `${effectiveName} (${rItem.sizeSpec})`;
        } else {
          effectiveName = `${effectiveName} #${count + 1}`;
        }
        seenNameCounts.set(cleanLowerName, count + 1);
      } else {
        seenNameCounts.set(cleanLowerName, 1);
      }

      const precisionRate = Number((rItem.rate || 0).toFixed(2));
      const precisionOldRate =
        rawPrevRate !== undefined && !isNaN(rawPrevRate) ? Number(rawPrevRate.toFixed(2)) : undefined;
      const resolvedCategory = rItem.category || categorizeCableItem(rItem.name, rItem.sizeSpec) || 'Single Core Wires';
      const defaultUnit = options?.isSpecialItemMode ? 'Bobin' : 'Coils';

      extractedRows.push({
        serial: rItem.serial,
        code: rItem.code || '',
        rawName: rItem.name,
        name: effectiveName,
        category: resolvedCategory,
        unit: rItem.unit || defaultUnit,
        sizeSpec: rItem.sizeSpec || '',
        openingStock: rItem.hasExplicitStock ? rItem.openingStock : 0,
        remarks: rItem.remarks || '',
        rate: precisionRate,
        effectiveDate: formattedDateCell,
        oldRate: precisionOldRate
      });
    }
  }

  const finalEffectiveDate = detectedDateFromFile
    || (overrideEffectiveDate ? formatDateDDMMYY(overrideEffectiveDate) : '')
    || getTodayDDMMYY();

  let updatedCount = 0;
  const previewList: PriceUpdatePreviewEntry[] = [];
  const rateUpdatesByItemId = new Map<string, { newRate: number; effectiveDate: string }>();
  const newlyCreatedItems: Item[] = [];
  const usedMatchedIds = new Set<string>();

  extractedRows.forEach((exRow, idx) => {
    const codeKey = (exRow.code || '').trim().toLowerCase();
    const nameKey = (exRow.name || '').trim().toLowerCase();
    const rawNameKey = (exRow.rawName || '').trim().toLowerCase();
    const catKey = (exRow.category || '').trim().toLowerCase();
    const normExName = nameKey.replace(/[^a-z0-9]/g, '');

    let matchedItem: Item | undefined = undefined;

    // 1. Exact unused Name + Category match
    if (nameKey && catKey) {
      matchedItem = currentItems.find(
        (i) =>
          !usedMatchedIds.has(i.id) &&
          i.name &&
          i.name.trim().toLowerCase() === nameKey &&
          (i.category || '').trim().toLowerCase() === catKey
      );
    }
    // 2. Exact unused Raw Name + Category match
    if (!matchedItem && rawNameKey && catKey) {
      matchedItem = currentItems.find(
        (i) =>
          !usedMatchedIds.has(i.id) &&
          i.name &&
          i.name.trim().toLowerCase() === rawNameKey &&
          (i.category || '').trim().toLowerCase() === catKey
      );
    }
    // 3. Exact unused Code match (only if categories don't conflict)
    if (!matchedItem && codeKey) {
      matchedItem = currentItems.find((i) => {
        if (usedMatchedIds.has(i.id) || !i.code || i.code.trim().toLowerCase() !== codeKey) return false;
        const iCat = (i.category || '').trim().toLowerCase();
        return !catKey || catKey === 'general' || !iCat || iCat === 'general' || iCat === catKey;
      });
    }
    // 4. Exact unused Name match (when category matches or is generic)
    if (!matchedItem && nameKey) {
      matchedItem = currentItems.find((i) => {
        if (usedMatchedIds.has(i.id) || !i.name || i.name.trim().toLowerCase() !== nameKey) return false;
        const iCat = (i.category || '').trim().toLowerCase();
        return !catKey || catKey === 'general' || !iCat || iCat === 'general' || iCat === catKey;
      });
    }
    // 5. Fallback unused exact Name match
    if (!matchedItem && nameKey) {
      matchedItem = currentItems.find(
        (i) => !usedMatchedIds.has(i.id) && i.name && i.name.trim().toLowerCase() === nameKey
      );
    }
    // 6. Normalized alphanumeric fallback (catches spacing/punctuation/spelling differences for mismatch review)
    if (!matchedItem && normExName.length >= 3) {
      matchedItem = currentItems.find((i) => {
        if (usedMatchedIds.has(i.id) || !i.name) return false;
        const iCat = (i.category || '').trim().toLowerCase();
        if (catKey && catKey !== 'general' && iCat && iCat !== 'general' && iCat !== catKey) return false;
        const normCatName = i.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normCatName === normExName;
      });
    }

    const rowEffDate = exRow.effectiveDate || finalEffectiveDate;

    if (matchedItem) {
      usedMatchedIds.add(matchedItem.id);
      rateUpdatesByItemId.set(matchedItem.id, {
        newRate: exRow.rate,
        effectiveDate: rowEffDate
      });

      const isChanged = Math.abs(exRow.rate - matchedItem.rate) > 0.001;
      if (isChanged) updatedCount++;

      const excelNameClean = (exRow.name || '').trim();
      const catalogNameClean = (matchedItem.name || '').trim();
      const hasMismatch = Boolean(excelNameClean && catalogNameClean && excelNameClean !== catalogNameClean);

      previewList.push({
        serial: exRow.serial ?? matchedItem.serial ?? matchedItem.serialNo ?? (idx + 1),
        code: exRow.code || matchedItem.code || '',
        name: exRow.name || matchedItem.name || '',
        excelName: excelNameClean,
        catalogName: catalogNameClean,
        hasNameMismatch: hasMismatch,
        category: exRow.category || matchedItem.category || 'General',
        unit: exRow.unit || matchedItem.unit || 'Coils',
        oldRate: matchedItem.rate,
        newRate: exRow.rate,
        effectiveDate: rowEffDate,
        diff: Number((exRow.rate - matchedItem.rate).toFixed(2)),
        diffPercent:
          matchedItem.rate > 0 ? Number((((exRow.rate - matchedItem.rate) / matchedItem.rate) * 100).toFixed(1)) : 0,
        isChanged,
        matchedItemId: matchedItem.id,
        status: 'matched',
        matchedItem
      });
    } else {
      const assignedSerial = exRow.serial ?? (idx + 1);
      const oldRateVal = exRow.oldRate || 0;
      const isSpecial = Boolean(options?.isSpecialItemMode);
      const resolvedCategory = exRow.category || categorizeCableItem(exRow.name, exRow.sizeSpec) || 'Single Core Wires';
      const resolvedUnit = exRow.unit || (isSpecial ? 'Bobin' : 'Coils');
      const detId = buildDeterministicItemId(
        `${isSpecial ? 'sp-' : ''}${exRow.code || ''}`,
        exRow.name,
        resolvedCategory
      );
      const existingIds = new Set([
        ...currentItems.map((i) => i.id),
        ...newlyCreatedItems.map((i) => i.id)
      ]);
      const uniqueId = existingIds.has(detId) ? `${detId}-${newlyCreatedItems.length + 1}` : detId;
      const nowIso = new Date().toISOString();

      newlyCreatedItems.push({
        id: uniqueId,
        code: exRow.code || `PC-${100 + currentItems.length + newlyCreatedItems.length + 1}`,
        name: exRow.name,
        category: resolvedCategory,
        unit: resolvedUnit,
        sizeSpec: exRow.sizeSpec || '',
        openingStock: exRow.openingStock || 0,
        remarks: exRow.remarks || '',
        rate: exRow.rate,
        serial: assignedSerial,
        serialNo: assignedSerial,
        order: typeof assignedSerial === 'number' ? assignedSerial : currentItems.length + newlyCreatedItems.length + 1,
        isSpecialItem: isSpecial,
        isActive: true,
        effectiveDate: rowEffDate,
        updatedAt: nowIso,
        priceHistory: [
          {
            effectiveDate: rowEffDate,
            rate: exRow.rate,
            updatedAt: nowIso,
            notes: `Created via Excel import: ৳${exRow.rate} (Eff: ${rowEffDate})`
          }
        ]
      });

      previewList.push({
        serial: assignedSerial,
        code: exRow.code || '',
        name: exRow.name,
        excelName: exRow.name,
        category: resolvedCategory,
        unit: resolvedUnit,
        sizeSpec: exRow.sizeSpec || '',
        openingStock: exRow.openingStock || 0,
        remarks: exRow.remarks || '',
        oldRate: oldRateVal,
        newRate: exRow.rate,
        effectiveDate: rowEffDate,
        diff: Number((exRow.rate - oldRateVal).toFixed(2)),
        diffPercent: 0,
        isChanged: true,
        matchedItemId: undefined,
        status: 'unmatched',
        matchedItem: undefined
      });
    }
  });

  const batchNowIso = new Date().toISOString();
  const baseUpdatedItems = currentItems.map((item) => {
    if (rateUpdatesByItemId.has(item.id)) {
      const update = rateUpdatesByItemId.get(item.id)!;
      const historyEntry = {
        effectiveDate: update.effectiveDate,
        rate: update.newRate,
        updatedAt: batchNowIso,
        notes: `Price updated via Excel: ৳${item.rate} -> ৳${update.newRate} (Eff: ${update.effectiveDate})`
      };
      const currentHistory = Array.isArray(item.priceHistory) ? item.priceHistory : [];
      return {
        ...item,
        rate: update.newRate,
        effectiveDate: update.effectiveDate,
        updatedAt: batchNowIso,
        priceHistory: [historyEntry, ...currentHistory.filter((h) => h.effectiveDate !== update.effectiveDate)]
      };
    }
    return item;
  });

  // Automatically include newly discovered items alongside updated catalog items for direct ingestion
  const updatedItems = [...baseUpdatedItems, ...newlyCreatedItems];

  return {
    updatedItems,
    updatedCount,
    createdCount: newlyCreatedItems.length,
    detectedEffectiveDate: finalEffectiveDate,
    previewList
  };
}

/**
 * Parse uploaded XLSX/XLS/CSV for Bulk Price Update & Direct Item Ingestion
 */
export async function parseXLSXForPriceUpdate(
  file: File,
  currentItems: Item[],
  options?: { isSpecialItemMode?: boolean }
): Promise<{ updatedItems: Item[]; updatedCount: number; createdCount: number }> {
  const wb = await readWorkbookFromFile(file);
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('Spreadsheet file is empty.');
  }

  const { nonEmptySheets, recommendedSelection } = selectWorkbookSheetsForImport(wb, options);
  if (nonEmptySheets.length === 0) {
    throw new Error('Spreadsheet file contains no data.');
  }

  const targetSheets =
    recommendedSelection === '__ALL__'
      ? nonEmptySheets
      : nonEmptySheets.filter((s) => s.sheetName === recommendedSelection);

  const normalizeName = (v?: string) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const isSpecial = Boolean(options?.isSpecialItemMode);
  const nowIso = new Date().toISOString();
  const todayIso = nowIso.slice(0, 10);

  const nextMap = new Map<string, Item>();
  currentItems.forEach((it) => {
    if (it && it.id) nextMap.set(it.id, it);
  });

  let updatedCount = 0;
  let createdCount = 0;

  for (const sheetEntry of targetSheets) {
    const { rows } = detectAndParseItemSheetRows(sheetEntry.rows, sheetEntry.sheetName);
    for (const rItem of rows) {
      const cleanName = rItem.name.trim().replace(/\s+/g, ' ');
      const normName = normalizeName(cleanName);
      const normCode = normalizeName(rItem.code);
      const normCat = normalizeName(rItem.category);
      if (!normName && !normCode) continue;

      if (rItem.hasExplicitCategory && rItem.category) {
        saveCustomCategory(rItem.category);
      }

      const pool = Array.from(nextMap.values()).filter((it) =>
        isSpecial ? Boolean(it.isSpecialItem) : Boolean(!it.isSpecialItem)
      );
      const existing =
        (normName && normCat
          ? pool.find((it) => normalizeName(it.name) === normName && normalizeName(it.category) === normCat)
          : undefined) ||
        (normCode ? pool.find((it) => it.code && normalizeName(it.code) === normCode) : undefined) ||
        (normName ? pool.find((it) => normalizeName(it.name) === normName) : undefined);

      if (existing) {
        const nextRate = rItem.hasExplicitRate || rItem.rate > 0 ? rItem.rate : existing.rate;
        if (nextRate !== existing.rate) {
          updatedCount++;
          nextMap.set(existing.id, {
            ...existing,
            rate: nextRate,
            effectiveDate: todayIso,
            updatedAt: nowIso
          });
        }
      } else {
        const resolvedCategory = rItem.category || categorizeCableItem(cleanName, rItem.sizeSpec) || 'Single Core Wires';
        const detId = buildDeterministicItemId(`${isSpecial ? 'sp-' : ''}${rItem.code || ''}`, cleanName, resolvedCategory);
        const newId = nextMap.has(detId) ? `${detId}-${createdCount + 1}` : detId;
        const serialVal = rItem.serial ?? nextMap.size + 1;
        nextMap.set(newId, {
          id: newId,
          code: rItem.code || `PC-${100 + nextMap.size + 1}`,
          name: cleanName,
          category: resolvedCategory,
          unit: rItem.unit || (isSpecial ? 'Bobin' : 'Coils'),
          sizeSpec: rItem.sizeSpec || '',
          openingStock: rItem.hasExplicitStock ? rItem.openingStock : 0,
          remarks: rItem.remarks || '',
          rate: rItem.rate,
          serial: serialVal,
          serialNo: serialVal,
          order: typeof serialVal === 'number' ? serialVal : nextMap.size + 1,
          isSpecialItem: isSpecial,
          isActive: true,
          effectiveDate: todayIso,
          updatedAt: nowIso
        });
        createdCount++;
      }
    }
  }

  return {
    updatedItems: Array.from(nextMap.values()),
    updatedCount,
    createdCount
  };
}

export function getPriceListRevisions(items: Item[]): PriceListRevision[] {
  try {
    const raw = localStorage.getItem('polycables_price_revisions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [
    {
      id: 'rev-default',
      effectiveDate: '01.02.2026',
      label: 'Price List (01.02.2026)',
      notes: 'Initial standard catalog rate revision',
      isActive: true,
      createdAt: new Date().toISOString(),
      itemCount: items.length,
      snapshotItems: items
    }
  ];
}

export function savePriceListRevisions(revisions: PriceListRevision[]): void {
  try {
    localStorage.setItem('polycables_price_revisions', JSON.stringify(revisions));
  } catch {}
}

export function activatePriceListRevision(
  revisionId: string,
  items: Item[]
): { updatedRevisions: PriceListRevision[]; updatedItems: Item[] } {
  const revisions = getPriceListRevisions(items);
  const target = revisions.find((r) => r.id === revisionId);
  const updatedRevisions = revisions.map((r) => ({
    ...r,
    isActive: r.id === revisionId
  }));
  savePriceListRevisions(updatedRevisions);
  const updatedItems = target?.snapshotItems && target.snapshotItems.length > 0 ? target.snapshotItems : items;
  return { updatedRevisions, updatedItems };
}

export function addPriceListRevision(
  effectiveDate: string,
  items: Item[],
  label: string,
  notes: string
): PriceListRevision[] {
  const revisions = getPriceListRevisions(items);
  const newRev: PriceListRevision = {
    id: `rev-${Date.now()}`,
    effectiveDate,
    label,
    notes,
    isActive: true,
    createdAt: new Date().toISOString(),
    itemCount: items.length,
    snapshotItems: items
  };
  const updatedRevisions = revisions.map((r) => ({ ...r, isActive: false }));
  updatedRevisions.unshift(newRev);
  savePriceListRevisions(updatedRevisions);
  return updatedRevisions;
}

