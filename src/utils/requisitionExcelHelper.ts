import ExcelJS from 'exceljs';

export interface RequisitionExcelLine {
  slNo?: number;
  description?: string;
  itemName?: string;
  quantity?: number | string;
  qty?: number | string;
  coilQty?: number | string;
  unit?: string;
  red?: number | string;
  black?: number | string;
  yellow?: number | string;
  green?: number | string;
  blue?: number | string;
  remarks?: string;
  rate?: number;
  totalAmount?: number;
  [key: string]: any;
}

export interface RequisitionExcelData {
  reqNo: string;
  reqDate?: string;
  date?: string;
  delvDate?: string;
  toDestination?: string;
  partyName?: string;
  partyAddress?: string;
  branchName?: string;
  branch?: string;
  remarks?: string;
  lines?: RequisitionExcelLine[];
  items?: RequisitionExcelLine[];
  totalQty?: number;
  totalAmount?: number;
  reqBySignature?: string;
  preparedBySignature?: string;
  checkedBySignature?: string;
  approvedBySignature?: string;
  [key: string]: any;
}

export function isReCableItem(name: string = '', spec: string = '', cat: string = ''): boolean {
  const combined = `${name} ${spec} ${cat}`.toLowerCase();
  // 1. Explicit RE tokens or parentheses e.g. "1.0 RE", "(RE)", "1.5 Re", "2.5RE"
  if (/\b\d+(\.\d+)?\s*re\b/i.test(combined)) return true;
  if (/\b\d+(\.\d+)?\s*\(re\)/i.test(combined)) return true;
  if (/\b(re|\(re\)|\[re\])\b/i.test(combined)) return true;
  if (combined.includes('(re)') || combined.includes('[re]')) return true;
  if (combined.includes('1.0re') || combined.includes('1.3re') || combined.includes('1.5re') || combined.includes('2.0re') || combined.includes('2.5re')) {
    return true;
  }
  // 2. Single wire / solid conductor terms
  if (combined.includes('1-w') || combined.includes('1w') || combined.includes('solid') || combined.includes('single wire')) {
    return true;
  }
  // 3. Word boundary RE
  if (/\bre\b/i.test(name) || /\bre\b/i.test(spec)) {
    return true;
  }
  return false;
}

/**
 * Format quantity display e.g. "10 Coils", "1500 Meter", "02 Coils", "01 Coil", "05 Coils"
 */
function formatSlipQuantity(qtyNum: number, unitStr: string = 'Coils'): string {
  if (!qtyNum && qtyNum !== 0) return '';
  const cleanUnit = (unitStr || 'Coils').trim();
  const lowerUnit = cleanUnit.toLowerCase();

  if (lowerUnit.includes('meter') || lowerUnit.includes('mtr')) {
    return `${qtyNum} Meter`;
  }
  if (lowerUnit.includes('bobin') || lowerUnit.includes('drum')) {
    return `${qtyNum} Bobin`;
  }
  if (lowerUnit.includes('pcs') || lowerUnit.includes('piece')) {
    return `${qtyNum} Pcs`;
  }

  // For coils:
  if (qtyNum === 1) {
    return '01 Coil';
  }
  const formattedNum = qtyNum < 10 && qtyNum > 0 ? `0${qtyNum}` : `${qtyNum}`;
  return `${formattedNum} Coils`;
}

/**
 * Clean and remove color breakdown substrings (e.g. "R:2, B:1, Y:1, G:1, BL:1", "R-10", "10-R", etc.) from remarks,
 * since Red, Black, Yellow, Green, and Blue are already extracted into their own dedicated table columns.
 */
export function cleanColorBreakdownFromRemarks(rawRemarks?: string): string {
  if (!rawRemarks || !rawRemarks.trim()) return '';
  let str = rawRemarks.trim();

  // If it's an auto-generated AI forecast calculation string, ignore it
  if (str.startsWith('AI ') && str.includes('Forecast')) {
    return '';
  }

  // 1. Remove parenthesized color breakdown e.g. "(R:2, B:1, Y:1, G:1, BL:1)" or "(R-2+B-1+Y-1)"
  str = str.replace(/\(\s*(?:(?:R|RED|B|BLK|BLACK|Y|YEL|YELLOW|G|GRN|GREEN|BL|BLU|BLUE|O|OTH|OTHER|OTHERS)\s*[:=-]\s*\d+\s*[,+; ]*\s*)+\)/gi, '');

  // 2. Remove isolated color codes e.g. "R:2", "B:1", "Y:1", "G:1", "BL:1", "Other:5", "R-10", "10-R", "10-BLK", "BL:2"
  str = str.replace(/\b(?:R|RED|B|BLK|BLACK|Y|YEL|YELLOW|G|GRN|GREEN|BL|BLU|BLUE|O|OTH|OTHER|OTHERS)\s*[:=-]\s*\d+\b/gi, '');
  str = str.replace(/\b\d+\s*[-/]\s*(?:R|RED|B|BLK|BLACK|Y|YEL|YELLOW|G|GRN|GREEN|BL|BLU|BLUE|O|OTH|OTHER|OTHERS)\b/gi, '');

  // 3. Clean up dangling commas, pluses, semicolons, empty parentheses
  str = str
    .replace(/^\s*[,+;.-]+\s*/, '')
    .replace(/\s*[,+;.-]+\s*$/, '')
    .replace(/\s*[,+;]\s*[,+;]\s*/g, ', ')
    .replace(/\(\s*\)/g, '')
    .trim();

  // If after cleaning only punctuation remains, return empty string
  if (/^[,+;.\-() ]*$/.test(str)) {
    return '';
  }

  return str;
}

/**
 * Build automatic or custom Remarks matching format e.g. "500 x 3", "500 x 2", "500 x 1"
 * Strips out color codes since colors are in separate columns.
 */
function formatSlipRemarks(line: RequisitionExcelLine, qtyNum: number, unitStr: string = ''): string {
  const cleanedCustomRemarks = cleanColorBreakdownFromRemarks(line.remarks);
  if (cleanedCustomRemarks) {
    return cleanedCustomRemarks;
  }

  const cleanUnit = (unitStr || line.unit || '').toLowerCase();
  const desc = (line.description || line.itemName || '').toLowerCase();

  // If length in meters and multiple of 500
  if (cleanUnit.includes('meter') || cleanUnit.includes('mtr') || desc.includes('bobin') || desc.includes('meter')) {
    if (qtyNum >= 500 && qtyNum % 500 === 0) {
      const coilsCount = qtyNum / 500;
      return `500 x ${coilsCount}`;
    }
  }

  return '';
}

/**
 * Build the full ExcelJS Workbook matching the exact Requisition Silp visual format
 */
export async function createRequisitionWorkbook(data: RequisitionExcelData): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Polycables';
  workbook.lastModifiedBy = 'Polycables Requisition System';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Requisition Silp', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2
      }
    },
    views: [{ showGridLines: true }]
  });

  // Set Column Widths (Columns A to I)
  worksheet.getColumn(1).width = 6;   // A: SL
  worksheet.getColumn(2).width = 30;  // B: Description of Items
  worksheet.getColumn(3).width = 16;  // C: Quantity
  worksheet.getColumn(4).width = 8;   // D: Red
  worksheet.getColumn(5).width = 8;   // E: Black
  worksheet.getColumn(6).width = 8;   // F: Yellow
  worksheet.getColumn(7).width = 8;   // G: Green
  worksheet.getColumn(8).width = 8;   // H: Blue
  worksheet.getColumn(9).width = 18;  // I: Remarks

  const thinBorderSide: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } };
  const cellBorderAll: Partial<ExcelJS.Borders> = {
    top: thinBorderSide,
    left: thinBorderSide,
    bottom: thinBorderSide,
    right: thinBorderSide
  };

  const startCol = 1; // A
  const endCol = 9;   // I
  const startRow = 1;

  // Row 1: Top spacing/margin
  worksheet.getRow(1).height = 10;

  // Row 2: TITLE: "Requisition Silp" (Blue Bold Font, Centered)
  const titleRow = worksheet.getRow(2);
  titleRow.height = 32;
  worksheet.mergeCells('A2:I2');
  const titleCell = worksheet.getCell('A2');
  titleCell.value = 'Requisition Silp';
  titleCell.font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FF0070C0' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3: Blank spacing
  worksheet.getRow(3).height = 8;

  // Header Details (Rows 4 to 7)
  const rawReqNo = (data.reqNo || '68-Subrata').trim();
  const strippedReqNo = rawReqNo.replace(/^(req\s*#*\s*)+/i, '').trim();
  const cleanReqNo = `req # ${strippedReqNo}`;
  const reqDateVal = data.reqDate || data.date || '27.08.2026';
  const delvDateVal = data.delvDate || data.reqDate || data.date || '27.08.2026';
  const toVal = data.toDestination || 'Factory';
  const partyVal = (data.partyName && data.partyName !== 'Customer') ? data.partyName : 'Sattar Electric';
  const partyAddrVal = data.partyAddress || 'Ghatail';

  // Row 4: Req # & Req Date
  worksheet.getRow(4).height = 19;
  const r4cA = worksheet.getCell('A4');
  r4cA.value = cleanReqNo;
  r4cA.font = { name: 'Arial', size: 10.5, bold: false };
  r4cA.alignment = { horizontal: 'left', vertical: 'middle' };

  worksheet.mergeCells('G4:I4');
  const r4cG = worksheet.getCell('G4');
  r4cG.value = `Req Date: ${reqDateVal}`;
  r4cG.font = { name: 'Arial', size: 10.5, bold: false };
  r4cG.alignment = { horizontal: 'left', vertical: 'middle' };

  // Row 5: To: Factory & Delv Date
  worksheet.getRow(5).height = 19;
  const r5cA = worksheet.getCell('A5');
  r5cA.value = `To   : ${toVal}`;
  r5cA.font = { name: 'Arial', size: 10.5, bold: false };
  r5cA.alignment = { horizontal: 'left', vertical: 'middle' };

  worksheet.mergeCells('G5:I5');
  const r5cG = worksheet.getCell('G5');
  r5cG.value = `Delv Date: ${delvDateVal}`;
  r5cG.font = { name: 'Arial', size: 10.5, bold: false };
  r5cG.alignment = { horizontal: 'left', vertical: 'middle' };

  // Row 6: Party : Sattar Electric
  worksheet.getRow(6).height = 19;
  const r6cA = worksheet.getCell('A6');
  r6cA.value = `Party : ${partyVal}`;
  r6cA.font = { name: 'Arial', size: 10.5, bold: false };
  r6cA.alignment = { horizontal: 'left', vertical: 'middle' };

  // Row 7: Party Address (e.g. Ghatail)
  worksheet.getRow(7).height = 19;
  const r7cA = worksheet.getCell('A7');
  r7cA.value = partyAddrVal ? `        ${partyAddrVal}` : '';
  r7cA.font = { name: 'Arial', size: 10.5, bold: false };
  r7cA.alignment = { horizontal: 'left', vertical: 'middle' };

  // Row 8: Spacing
  worksheet.getRow(8).height = 8;

  // Row 9: Table Column Headers
  const tableHeaderRowIndex = 9;
  const headerRow = worksheet.getRow(tableHeaderRowIndex);
  headerRow.height = 24;

  const headers = ['SL', 'Description of Items', 'Quantity', 'Red', 'Black', 'Yellow', 'Green', 'Blue', 'Remarks'];
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = cellBorderAll;
  });

  // Table Data Rows - only output actual items (e.g. exactly 3 rows if there are 3 items)
  const rawItems = data.lines || data.items || [];
  const validItems = rawItems.filter(
    (line) =>
      (line.description && line.description.trim() !== '') ||
      (line.itemName && line.itemName.trim() !== '') ||
      (Number(line.quantity || line.qty || line.coilQty || 0) > 0)
  );
  const itemsList = validItems.length > 0 ? validItems : (rawItems.length > 0 ? [rawItems[0]] : []);
  let currentRowIndex = 10;

  itemsList.forEach((line, idx) => {
    const row = worksheet.getRow(currentRowIndex);
    row.height = 20;

    const sl = idx + 1;
    const desc = line.description || line.itemName || '';
    const rawQty = Number(line.quantity || line.qty || line.coilQty || 0);
    const unit = line.unit || 'Coils';
    const qtyFormatted = formatSlipQuantity(rawQty, unit);

    const redVal = line.red !== undefined && line.red !== null && line.red !== '' && line.red !== 0 ? line.red : '';
    const blackVal = line.black !== undefined && line.black !== null && line.black !== '' && line.black !== 0 ? line.black : '';
    const yellowVal = line.yellow !== undefined && line.yellow !== null && line.yellow !== '' && line.yellow !== 0 ? line.yellow : '';
    const greenVal = line.green !== undefined && line.green !== null && line.green !== '' && line.green !== 0 ? line.green : '';
    const blueVal = line.blue !== undefined && line.blue !== null && line.blue !== '' && line.blue !== 0 ? line.blue : '';
    const remarksVal = formatSlipRemarks(line, rawQty, unit);

    const rowData = [sl, desc, qtyFormatted, redVal, blackVal, yellowVal, greenVal, blueVal, remarksVal];

    rowData.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Arial', size: 10 };
      cell.border = cellBorderAll;

      if (cIdx === 1) {
        // Description of Items: Left-aligned
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      } else if (cIdx === 8) {
        // Remarks: Centered or Left
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (typeof val === 'string' && val.includes('x')) {
          cell.font = { name: 'Arial', size: 10, bold: true };
        }
      } else {
        // SL, Quantity, Red, Black, Yellow, Green, Blue: Centered
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });

    currentRowIndex++;
  });

  // Spacing before signatures
  worksheet.getRow(currentRowIndex).height = 14;
  currentRowIndex++;
  worksheet.getRow(currentRowIndex).height = 14;
  currentRowIndex++;

  // Signatures Row 1 (Names)
  const nameRowIdx = currentRowIndex;
  const nameRow = worksheet.getRow(nameRowIdx);
  nameRow.height = 18;

  const reqByName = data.reqBySignature || 'Subrata';
  const prepByName = data.preparedBySignature || 'Rajon';
  const appByName = data.approvedBySignature || 'Shaheen Khan';

  worksheet.mergeCells(`A${nameRowIdx}:B${nameRowIdx}`);
  const reqNameCell = worksheet.getCell(`A${nameRowIdx}`);
  reqNameCell.value = reqByName;
  reqNameCell.font = { name: 'Arial', size: 10.5, bold: false };
  reqNameCell.alignment = { horizontal: 'center', vertical: 'bottom' };

  worksheet.mergeCells(`E${nameRowIdx}:F${nameRowIdx}`);
  const prepNameCell = worksheet.getCell(`E${nameRowIdx}`);
  prepNameCell.value = prepByName;
  prepNameCell.font = { name: 'Arial', size: 10.5, bold: false };
  prepNameCell.alignment = { horizontal: 'center', vertical: 'bottom' };

  worksheet.mergeCells(`H${nameRowIdx}:I${nameRowIdx}`);
  const appNameCell = worksheet.getCell(`H${nameRowIdx}`);
  appNameCell.value = appByName;
  appNameCell.font = { name: 'Arial', size: 10.5, bold: false };
  appNameCell.alignment = { horizontal: 'center', vertical: 'bottom' };

  currentRowIndex++;

  // Signatures Row 2 (Titles with Top Border line)
  const titleRowIdx = currentRowIndex;
  const sTitleRow = worksheet.getRow(titleRowIdx);
  sTitleRow.height = 20;

  const sigBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF000000' } }
  };

  worksheet.mergeCells(`A${titleRowIdx}:B${titleRowIdx}`);
  const reqTitleCell = worksheet.getCell(`A${titleRowIdx}`);
  reqTitleCell.value = 'Req. By';
  reqTitleCell.font = { name: 'Arial', size: 10.5, bold: false };
  reqTitleCell.alignment = { horizontal: 'center', vertical: 'top' };
  worksheet.getCell(`A${titleRowIdx}`).border = sigBorder;
  worksheet.getCell(`B${titleRowIdx}`).border = sigBorder;

  worksheet.mergeCells(`E${titleRowIdx}:F${titleRowIdx}`);
  const prepTitleCell = worksheet.getCell(`E${titleRowIdx}`);
  prepTitleCell.value = 'Prepared By';
  prepTitleCell.font = { name: 'Arial', size: 10.5, bold: false };
  prepTitleCell.alignment = { horizontal: 'center', vertical: 'top' };
  worksheet.getCell(`E${titleRowIdx}`).border = sigBorder;
  worksheet.getCell(`F${titleRowIdx}`).border = sigBorder;

  worksheet.mergeCells(`H${titleRowIdx}:I${titleRowIdx}`);
  const appTitleCell = worksheet.getCell(`H${titleRowIdx}`);
  appTitleCell.value = 'Approved By';
  appTitleCell.font = { name: 'Arial', size: 10.5, bold: false };
  appTitleCell.alignment = { horizontal: 'center', vertical: 'top' };
  worksheet.getCell(`H${titleRowIdx}`).border = sigBorder;
  worksheet.getCell(`I${titleRowIdx}`).border = sigBorder;

  // Bottom spacing
  currentRowIndex++;
  worksheet.getRow(currentRowIndex).height = 12;

  const lastDocumentRow = currentRowIndex;

  // Apply Thick Outer Framing Border around the entire Requisition Slip (Row 1 to lastDocumentRow, Col A to I)
  const thickBorderSide: ExcelJS.Border = { style: 'medium', color: { argb: 'FF000000' } };

  for (let r = startRow; r <= lastDocumentRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = worksheet.getRow(r).getCell(c);
      const existingBorders: any = cell.border || {};

      const newBorders: any = { ...existingBorders };

      if (r === startRow) newBorders.top = thickBorderSide;
      if (r === lastDocumentRow) newBorders.bottom = thickBorderSide;
      if (c === startCol) newBorders.left = thickBorderSide;
      if (c === endCol) newBorders.right = thickBorderSide;

      cell.border = newBorders;
    }
  }

  return workbook;
}

/**
 * Generate Base64 string of the Requisition Slip Excel (.xlsx) file
 */
export async function generateRequisitionExcelBase64(data: RequisitionExcelData): Promise<string> {
  const workbook = await createRequisitionWorkbook(data);
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
 * Download the formatted Requisition Slip Excel (.xlsx) file directly to user's device
 */
export async function downloadRequisitionExcel(data: RequisitionExcelData, fileName?: string): Promise<void> {
  const workbook = await createRequisitionWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanSeq = (data.reqNo || 'export').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanDate = (data.reqDate || data.date || '').replace(/\./g, '-');
  a.download = fileName || `Requisition_${cleanSeq}_${cleanDate || 'Slip'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

