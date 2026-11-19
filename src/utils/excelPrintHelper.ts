import ExcelJS from 'exceljs';
import { formatDateDDMMYY } from './dateUtils';

const DARK_THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } }
};

export interface StyledExcelReportPayload {
  title: string;
  centerName?: string;
  periodName?: string;
  billType?: string;
  fileName?: string;
  headers: string[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  metadataLines?: string[];
  orientation?: 'portrait' | 'landscape';
}

function triggerExcelDownload(buffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  }, 5000);
}

interface ParsedCell {
  rowOffset: number;
  colOffset: number;
  colSpan: number;
  rowSpan: number;
  value: string | number;
  align: 'left' | 'center' | 'right';
  isBold: boolean;
  section: 'thead' | 'tbody' | 'tfoot';
}

interface ParsedStructuredTable {
  caption?: string;
  colCount: number;
  rowCount: number;
  cells: ParsedCell[];
  colMaxChars: number[];
}

/**
 * Generates and downloads an ExcelJS workbook matching the user's standard Poly Cables style:
 * - Row 1: POLY CABLES IND. LTD. (Calibri 16pt bold centered)
 * - Row 2: Center / Branch Subtitle (Calibri 10pt bold centered)
 * - Row 3: Underlined Document / Report Title (Calibri 11pt bold underlined centered)
 * - Metadata row(s) with medium black bottom border
 * - #FFE8EEF5 header cells with dark thin black borders
 * - Gridlines enabled & A4 fit-to-page setup
 */
export async function exportDomOrDataToStyledExcel(payload: StyledExcelReportPayload): Promise<void> {
  const {
    title,
    centerName = 'ALL SALES CENTERS',
    periodName = formatDateDDMMYY(new Date()),
    billType = 'REPORT',
    fileName,
    headers,
    rows,
    totalsRow,
    metadataLines = [],
    orientation
  } = payload;

  const colCount = Math.max(
    headers.length || 1,
    rows.reduce((max, r) => Math.max(max, r.length), 0),
    6
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Poly Cables Ind. Ltd.';
  wb.lastModifiedBy = 'Poly Cables Ind. Ltd.';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('Print_Document', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: orientation || (colCount > 7 ? 'landscape' : 'portrait'),
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
    },
    views: [{ showGridLines: true }]
  });

  // Compute smart column widths
  const colWidths = Array.from({ length: colCount }, (_, colIdx) => {
    let maxLen = String(headers[colIdx] || '').length;
    rows.forEach((r) => {
      const len = String(r[colIdx] ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    if (totalsRow && totalsRow[colIdx] !== undefined) {
      maxLen = Math.max(maxLen, String(totalsRow[colIdx]).length);
    }
    return { width: Math.min(48, Math.max(10, maxLen + 4)) };
  });
  ws.columns = colWidths;

  const lastColLetter = ws.getColumn(colCount).letter;

  // Row 1: Company Name
  const r1 = ws.addRow(['POLY CABLES IND. LTD.']);
  r1.height = 26;
  ws.mergeCells(`A1:${lastColLetter}1`);
  const c1 = ws.getCell('A1');
  c1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF000000' } };
  c1.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2: Sales Center / Subtitle
  const r2 = ws.addRow([(centerName || 'HEAD OFFICE / SALES CENTER').toUpperCase()]);
  r2.height = 18;
  ws.mergeCells(`A2:${lastColLetter}2`);
  const c2 = ws.getCell('A2');
  c2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
  c2.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3: Underlined Title
  const r3 = ws.addRow([(title || 'STATEMENT / DOCUMENT').toUpperCase()]);
  r3.height = 22;
  ws.mergeCells(`A3:${lastColLetter}3`);
  const c3 = ws.getCell('A3');
  c3.font = { name: 'Calibri', size: 11, bold: true, underline: true, color: { argb: 'FF000000' } };
  c3.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 4: Period | Type | Date
  const dateStr = formatDateDDMMYY(new Date());
  const metaLeftCol = Math.max(1, Math.floor(colCount / 3));
  const metaMidEndCol = Math.max(metaLeftCol + 1, Math.floor((colCount * 2) / 3));

  const row4Arr = new Array(colCount).fill('');
  row4Arr[0] = `Period / Ref: ${periodName}`;
  row4Arr[metaLeftCol] = `Type: ${billType}`;
  row4Arr[metaMidEndCol] = `Date: ${dateStr}`;
  const r4 = ws.addRow(row4Arr);
  r4.height = 20;

  if (colCount >= 3) {
    ws.mergeCells(4, 1, 4, metaLeftCol);
    ws.mergeCells(4, metaLeftCol + 1, 4, metaMidEndCol);
    ws.mergeCells(4, metaMidEndCol + 1, 4, colCount);
  }
  const c4L = ws.getCell(4, 1);
  c4L.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF000000' } };
  c4L.alignment = { horizontal: 'left', vertical: 'middle' };
  const c4M = ws.getCell(4, metaLeftCol + 1);
  c4M.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF000000' } };
  c4M.alignment = { horizontal: 'center', vertical: 'middle' };
  const c4R = ws.getCell(4, metaMidEndCol + 1);
  c4R.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF000000' } };
  c4R.alignment = { horizontal: 'right', vertical: 'middle' };

  for (let c = 1; c <= colCount; c++) {
    ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
  }

  // Optional Extra Metadata Lines (Party, Address, Bill No, Ref No, Salesman Code, etc.)
  metadataLines
    .filter((line) => line && line.trim())
    .slice(0, 12)
    .forEach((line) => {
      const mr = ws.addRow([line.trim()]);
      mr.height = 17;
      ws.mergeCells(mr.number, 1, mr.number, colCount);
      const cell = ws.getCell(mr.number, 1);
      cell.font = { name: 'Calibri', size: 9.5, bold: false, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });

  // Blank separator
  const spacer = ws.addRow([]);
  spacer.height = 6;

  // Header Row
  if (headers.length > 0) {
    const paddedHeaders = [...headers];
    while (paddedHeaders.length < colCount) paddedHeaders.push('');
    const hRow = ws.addRow(paddedHeaders);
    hRow.height = 24;
    for (let c = 1; c <= colCount; c++) {
      const cell = hRow.getCell(c);
      cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = DARK_THIN_BORDER;
    }
  }

  // Body Rows
  rows.forEach((rowVals) => {
    const padded = [...rowVals];
    while (padded.length < colCount) padded.push('');
    const dRow = ws.addRow(padded);
    dRow.height = 20;

    const firstText = String(padded[0] ?? '').toLowerCase();
    const secondText = String(padded[1] ?? '').toLowerCase();
    const isTotalLike =
      firstText.includes('total') ||
      secondText.includes('total') ||
      secondText.includes('subtotal');

    for (let c = 1; c <= colCount; c++) {
      const cell = dRow.getCell(c);
      const raw = padded[c - 1];
      const strVal = String(raw ?? '');
      const isNumericLike =
        typeof raw === 'number' ||
        /^[৳+-]?[\d,]+(\.\d+)?(\/-)?$/.test(strVal.trim());

      cell.border = DARK_THIN_BORDER;
      cell.font = {
        name: 'Calibri',
        size: 9.5,
        bold: isTotalLike || c === 2,
        color: { argb: 'FF000000' }
      };
      if (isTotalLike) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6FA' } };
      }
      cell.alignment = {
        horizontal: isNumericLike ? 'right' : c === 1 ? 'center' : 'left',
        vertical: 'middle',
        wrapText: true
      };
    }
  });

  // Optional Explicit Totals Row
  if (totalsRow && totalsRow.length > 0) {
    const padded = [...totalsRow];
    while (padded.length < colCount) padded.push('');
    const tRow = ws.addRow(padded);
    tRow.height = 22;
    for (let c = 1; c <= colCount; c++) {
      const cell = tRow.getCell(c);
      const raw = padded[c - 1];
      const isNum =
        typeof raw === 'number' ||
        /^[৳+-]?[\d,]+(\.\d+)?(\/-)?$/.test(String(raw ?? '').trim());
      cell.border = DARK_THIN_BORDER;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
      cell.alignment = {
        horizontal: isNum ? 'right' : 'center',
        vertical: 'middle'
      };
    }
  }

  // Blank space + Signature block at bottom
  ws.addRow([]).height = 14;
  const sigRowArr = new Array(colCount).fill('');
  sigRowArr[0] = "Receiver's Signature";
  if (colCount >= 3) sigRowArr[Math.floor(colCount / 3)] = 'Prepared By';
  if (colCount >= 4) sigRowArr[Math.floor((colCount * 2) / 3)] = 'Check By';
  sigRowArr[colCount - 1] = 'Approved By';
  const sigRow = ws.addRow(sigRowArr);
  sigRow.height = 18;
  for (let c = 1; c <= colCount; c++) {
    const cell = sigRow.getCell(c);
    if (sigRowArr[c - 1]) {
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF000000' } };
      cell.border = { top: { style: 'thin', color: { argb: 'FF000000' } } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  const safeName = (fileName || `${title.replace(/[^a-z0-9]+/gi, '_')}_${dateStr}.xlsx`)
    .replace(/[^a-z0-9_.-]+/gi, '_');
  const buffer = await wb.xlsx.writeBuffer();
  triggerExcelDownload(buffer as ArrayBuffer, safeName);
}

/**
 * Finds the highest-priority visible printable container in the active DOM
 */
function findActivePrintableRoot(): HTMLElement | null {
  const prioritySelectors = [
    '.print-preview-modal-backdrop .print-paper-sheet',
    '.print-preview-modal-backdrop .bill-paper-dimensions',
    '.print-preview-modal-backdrop .printable-slip-pad',
    '.print-paper-sheet',
    '.printable-slip-pad',
    '.slip-pad-page',
    '#printable-bill-invoice-document',
    '#printable-delivery-challan-document',
    '.bill-paper-dimensions',
    '.challan-print-sheet',
    '.expense-print-sheet',
    '.expense-statement-sheet'
  ];

  for (const sel of prioritySelectors) {
    const matches = Array.from(document.querySelectorAll<HTMLElement>(sel));
    for (let i = matches.length - 1; i >= 0; i--) {
      const el = matches[i];
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && (rect.width > 50 || rect.height > 50)) {
        return el;
      }
    }
  }

  // Fallback to topmost open modal dialog
  const modals = Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0, [role="dialog"]'));
  for (let i = modals.length - 1; i >= 0; i--) {
    const el = modals[i];
    const style = window.getComputedStyle(el);
    if (style.display !== 'none' && style.visibility !== 'hidden' && el.querySelector('table')) {
      return el;
    }
  }

  // Fallback to main page content
  return document.querySelector<HTMLElement>('main') || document.body;
}

function cleanText(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractVisibleCellValue(cellEl: HTMLElement, detachedRoot: boolean): string {
  // Prefer active form input/select/textarea values inside editable bills/challans/forms
  const formControls = Array.from(
    cellEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]), select, textarea'
    )
  ).filter((ctrl) => {
    if (ctrl.closest('.no-print')) return false;
    if (!detachedRoot) {
      const s = window.getComputedStyle(ctrl);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
    }
    return true;
  });

  if (formControls.length > 0) {
    const vals = formControls
      .map((ctrl) => {
        if (ctrl instanceof HTMLSelectElement) {
          return cleanText(ctrl.options[ctrl.selectedIndex]?.text || ctrl.value);
        }
        return cleanText(ctrl.value);
      })
      .filter(Boolean);
    if (vals.length > 0) return vals.join(' ');
  }

  // Extract text while skipping .no-print interactive controls inside the cell
  const clone = cellEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print, script, style').forEach((n) => n.remove());
  return cleanText(clone.textContent);
}

function detectCellAlignment(cellEl: HTMLElement, rawVal: string, isHeader: boolean, detachedRoot: boolean): 'left' | 'center' | 'right' {
  const cls = String(cellEl.className || '');
  if (/\btext-right\b/.test(cls)) return 'right';
  if (/\btext-center\b/.test(cls)) return 'center';
  if (/\btext-left\b/.test(cls)) return 'left';

  if (!detachedRoot) {
    const computedAlign = window.getComputedStyle(cellEl).textAlign;
    if (computedAlign === 'right' || computedAlign === 'end') return 'right';
    if (computedAlign === 'center') return 'center';
    if (computedAlign === 'left' || computedAlign === 'start') return 'left';
  }

  if (isHeader) return 'center';
  if (/^[৳+-]?[\d,]+(\.\d+)?(\/-)?$/.test(rawVal.trim())) return 'right';
  return 'left';
}

function parseTableWithStructure(table: HTMLTableElement, detachedRoot: boolean): ParsedStructuredTable {
  const cells: ParsedCell[] = [];
  const colMaxChars: number[] = [];
  const occupied = new Set<string>();

  const sectionBuckets: Array<{ section: 'thead' | 'tbody' | 'tfoot'; trs: HTMLTableRowElement[] }> = [];
  const directThead = Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > thead > tr'));
  const directTbody = Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr'));
  const directTfoot = Array.from(table.querySelectorAll<HTMLTableRowElement>(':scope > tfoot > tr'));

  if (directThead.length || directTbody.length || directTfoot.length) {
    if (directThead.length) sectionBuckets.push({ section: 'thead', trs: directThead });
    if (directTbody.length) sectionBuckets.push({ section: 'tbody', trs: directTbody });
    if (directTfoot.length) sectionBuckets.push({ section: 'tfoot', trs: directTfoot });
  } else {
    const allTrs = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr'));
    if (allTrs.length) sectionBuckets.push({ section: 'tbody', trs: allTrs });
  }

  let rowOffset = 0;
  let maxColCount = 0;

  for (const bucket of sectionBuckets) {
    for (const tr of bucket.trs) {
      if (tr.classList.contains('no-print')) continue;
      if (!detachedRoot) {
        const s = window.getComputedStyle(tr);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
      }

      const rawChildren = Array.from(tr.children).filter((child) => {
        const el = child as HTMLElement;
        if (el.classList.contains('no-print')) return false;
        if (!detachedRoot) {
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none') return false;
        }
        return true;
      });

      if (rawChildren.length === 0) continue;

      let colCursor = 0;
      let hasNonEmpty = false;
      const rowCells: ParsedCell[] = [];

      for (const child of rawChildren) {
        while (occupied.has(`${rowOffset}:${colCursor}`)) {
          colCursor++;
        }

        const el = child as HTMLElement;
        const colSpan = Math.max(1, Number(el.getAttribute('colspan') || 1));
        const rowSpan = Math.max(1, Number(el.getAttribute('rowspan') || 1));
        const strVal = extractVisibleCellValue(el, detachedRoot);
        if (strVal !== '') hasNonEmpty = true;

        const isHeader = bucket.section === 'thead' || el.tagName === 'TH';
        const isFooter = bucket.section === 'tfoot';
        const cls = String(el.className || '');
        const trCls = String(tr.className || '');
        const isBold =
          isHeader ||
          isFooter ||
          /\bfont-(bold|extrabold|black|semibold)\b/.test(cls) ||
          /\bfont-(bold|extrabold|black|semibold)\b/.test(trCls);

        const align = detectCellAlignment(el, strVal, isHeader, detachedRoot);

        for (let dr = 0; dr < rowSpan; dr++) {
          for (let dc = 0; dc < colSpan; dc++) {
            occupied.add(`${rowOffset + dr}:${colCursor + dc}`);
          }
        }

        // Convert plain comma-formatted pure numbers to numeric Excel values only when safe (keeps ৳ prefix / codes untouched)
        let cellValue: string | number = strVal;
        if (/^-?\d+(\.\d+)?$/.test(strVal) && strVal.length <= 15 && !/^0\d+/.test(strVal)) {
          const num = Number(strVal);
          if (Number.isFinite(num)) cellValue = num;
        }

        const perColLen = Math.ceil(strVal.length / colSpan);
        for (let dc = 0; dc < colSpan; dc++) {
          const ci = colCursor + dc;
          colMaxChars[ci] = Math.max(colMaxChars[ci] || 8, perColLen);
        }

        rowCells.push({
          rowOffset,
          colOffset: colCursor,
          colSpan,
          rowSpan,
          value: cellValue,
          align,
          isBold,
          section: bucket.section
        });

        colCursor += colSpan;
        if (colCursor > maxColCount) maxColCount = colCursor;
      }

      if (hasNonEmpty || bucket.section === 'thead') {
        cells.push(...rowCells);
        rowOffset++;
      }
    }
  }

  return {
    colCount: maxColCount,
    rowCount: rowOffset,
    cells,
    colMaxChars
  };
}

/**
 * Automatically converts the active printable document or custom HTML root into a styled ExcelJS .xlsx file
 * matching the exact visible table layout, merged headers/footers, alignments, and view displayed in the app.
 */
export async function exportActiveDocumentToStyledExcel(
  overrideRoot?: HTMLElement | null,
  explicitTitle?: string
): Promise<boolean> {
  try {
    const detachedRoot = Boolean(overrideRoot);
    const root = overrideRoot || findActivePrintableRoot();
    if (!root) return false;

    const tables = Array.from(root.querySelectorAll<HTMLTableElement>('table')).filter((t) => {
      if (t.closest('.no-print')) return false;
      if (!detachedRoot) {
        const s = window.getComputedStyle(t);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = t.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
      }
      return t.querySelectorAll('tr').length > 0;
    });

    // Extract title & headings
    const headings = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, .delivery-challan-badge'))
      .filter((h) => !h.closest('.no-print'))
      .map((h) => cleanText(h.textContent))
      .filter((t) => t && !/^poly\s*cables/i.test(t));

    const fallbackWinTitle =
      (typeof window !== 'undefined' && (window as any).__polycablesLastDocTitle) ||
      document.title ||
      'Poly Cables Print Document';

    const docTitle = explicitTitle || headings[0] || fallbackWinTitle || 'Poly Cables Print Document';

    // Extract branch/center line if present
    const centerNode = root.querySelector<HTMLElement>('.madhupur-address-line');
    const centerName = centerNode ? cleanText(centerNode.textContent) : 'POLY CABLES SALES CENTER / HEAD OFFICE';

    // Extract metadata paragraphs/inputs outside tables
    const metaLines: string[] = [];
    const seenMeta = new Set<string>();
    const metaCandidates = Array.from(root.querySelectorAll<HTMLElement>('p, div'))
      .filter((el) => {
        if (el.closest('table') || el.closest('.no-print') || el.closest('tfoot') || el.closest('thead')) return false;
        if (el.children.length > 3) return false;
        const txt = cleanText(el.textContent);
        return txt.length >= 4 && txt.length <= 140 && txt.includes(':');
      });

    for (const el of metaCandidates) {
      const txt = cleanText(el.textContent);
      if (!seenMeta.has(txt) && !txt.toLowerCase().includes('poly cables')) {
        seenMeta.add(txt);
        metaLines.push(txt);
        if (metaLines.length >= 10) break;
      }
    }

    if (tables.length === 0) {
      // Non-table card/summary print fallback
      const cloneRoot = root.cloneNode(true) as HTMLElement;
      cloneRoot.querySelectorAll('.no-print, script, style').forEach((n) => n.remove());
      const rawContent = cleanText(cloneRoot.textContent || '');
      const textLines = rawContent
        .split(/(?=[A-Z][a-z]+:)/)
        .map((s) => s.trim())
        .filter(Boolean);

      await exportDomOrDataToStyledExcel({
        title: docTitle,
        centerName,
        periodName: formatDateDDMMYY(new Date()),
        billType: 'DOCUMENT',
        headers: ['SL #', 'Field / Item Description', 'Details / Value'],
        rows: (textLines.length > 0 ? textLines : [docTitle]).map((line, i) => [i + 1, 'Entry', line]),
        metadataLines: metaLines
      });
      return true;
    }

    const parsedTables = tables
      .map((tbl) => parseTableWithStructure(tbl, detachedRoot))
      .filter((pt) => pt.colCount > 0 && pt.rowCount > 0);

    if (parsedTables.length === 0) {
      return false;
    }

    const maxCols = Math.max(6, ...parsedTables.map((t) => t.colCount));
    const dateStr = formatDateDDMMYY(new Date());

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Poly Cables Ind. Ltd.';
    wb.lastModifiedBy = 'Poly Cables Ind. Ltd.';
    wb.created = new Date();
    wb.modified = new Date();

    const isBillOrChallanSheet = Boolean(
      root.matches?.('.bill-paper-dimensions, .challan-print-sheet, #printable-bill-invoice-document, #printable-delivery-challan-document') ||
      root.querySelector?.('.bill-paper-dimensions, .challan-print-sheet')
    );

    const ws = wb.addWorksheet('Print_Document', {
      pageSetup: {
        paperSize: 9,
        orientation: isBillOrChallanSheet ? 'portrait' : (maxCols > 7 ? 'landscape' : 'portrait'),
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.28, right: 0.28, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 }
      },
      views: [{ showGridLines: true }]
    });

    // Compute exact column widths across all tables matching displayed proportions
    const combinedColWidths = Array.from({ length: maxCols }, (_, colIdx) => {
      let maxLen = 8;
      parsedTables.forEach((pt) => {
        if (pt.colMaxChars[colIdx]) {
          maxLen = Math.max(maxLen, pt.colMaxChars[colIdx]);
        }
      });
      return { width: Math.min(48, Math.max(10, maxLen + 4)) };
    });
    ws.columns = combinedColWidths;

    const lastColLetter = ws.getColumn(maxCols).letter;

    // Row 1: Company Name
    const r1 = ws.addRow(['POLY CABLES IND. LTD.']);
    r1.height = 26;
    ws.mergeCells(`A1:${lastColLetter}1`);
    const c1 = ws.getCell('A1');
    c1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF000000' } };
    c1.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 2: Sales Center / Branch Address
    const r2 = ws.addRow([(centerName || 'HEAD OFFICE / SALES CENTER').toUpperCase()]);
    r2.height = 18;
    ws.mergeCells(`A2:${lastColLetter}2`);
    const c2 = ws.getCell('A2');
    c2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
    c2.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 3: Underlined Document / Report Title
    const r3 = ws.addRow([(docTitle || 'STATEMENT / DOCUMENT').toUpperCase()]);
    r3.height = 22;
    ws.mergeCells(`A3:${lastColLetter}3`);
    const c3 = ws.getCell('A3');
    c3.font = { name: 'Calibri', size: 11, bold: true, underline: true, color: { argb: 'FF000000' } };
    c3.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 4: Period | Export Mode | Date
    const metaLeftCol = Math.max(1, Math.floor(maxCols / 3));
    const metaMidEndCol = Math.max(metaLeftCol + 1, Math.floor((maxCols * 2) / 3));
    const row4Arr = new Array(maxCols).fill('');
    row4Arr[0] = `Export Date: ${dateStr}`;
    row4Arr[metaLeftCol] = `Document: ${docTitle}`;
    row4Arr[metaMidEndCol] = `Format: Exact App Table View`;
    const r4 = ws.addRow(row4Arr);
    r4.height = 20;
    if (maxCols >= 3) {
      ws.mergeCells(4, 1, 4, metaLeftCol);
      ws.mergeCells(4, metaLeftCol + 1, 4, metaMidEndCol);
      ws.mergeCells(4, metaMidEndCol + 1, 4, maxCols);
    }
    ws.getCell(4, 1).font = { name: 'Calibri', size: 9.5, color: { argb: 'FF000000' } };
    ws.getCell(4, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getCell(4, metaLeftCol + 1).font = { name: 'Calibri', size: 9.5, color: { argb: 'FF000000' } };
    ws.getCell(4, metaLeftCol + 1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(4, metaMidEndCol + 1).font = { name: 'Calibri', size: 9.5, color: { argb: 'FF000000' } };
    ws.getCell(4, metaMidEndCol + 1).alignment = { horizontal: 'right', vertical: 'middle' };
    for (let c = 1; c <= maxCols; c++) {
      ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
    }

    // Extra metadata lines (Party, Address, Invoice #, Salesman, Filters)
    metaLines.forEach((line) => {
      const mr = ws.addRow([line]);
      mr.height = 17;
      ws.mergeCells(mr.number, 1, mr.number, maxCols);
      const cell = ws.getCell(mr.number, 1);
      cell.font = { name: 'Calibri', size: 9.5, bold: false, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });

    ws.addRow([]).height = 6;

    // Render each exact structured table preserving headers, footers, alignments & cell spans
    parsedTables.forEach((pt, tIdx) => {
      if (tIdx > 0) {
        ws.addRow([]).height = 10;
      }

      const startExcelRow = ws.rowCount + 1;
      for (let r = 0; r < pt.rowCount; r++) {
        const emptyRow = ws.addRow(new Array(pt.colCount).fill(''));
        emptyRow.height = 21;
      }

      // First ensure all cells within this table bounds have dark borders
      for (let r = 0; r < pt.rowCount; r++) {
        for (let c = 1; c <= pt.colCount; c++) {
          ws.getCell(startExcelRow + r, c).border = DARK_THIN_BORDER;
        }
      }

      pt.cells.forEach((pc) => {
        const excelRow = startExcelRow + pc.rowOffset;
        const excelCol = 1 + pc.colOffset;
        const cell = ws.getCell(excelRow, excelCol);
        cell.value = pc.value;
        cell.border = DARK_THIN_BORDER;
        cell.font = {
          name: 'Calibri',
          size: pc.section === 'thead' || pc.section === 'tfoot' ? 10 : 9.5,
          bold: pc.isBold,
          color: { argb: 'FF000000' }
        };

        if (pc.section === 'thead' || pc.section === 'tfoot') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
        }

        cell.alignment = {
          horizontal: pc.align,
          vertical: 'middle',
          wrapText: true
        };

        if (pc.rowSpan > 1 || pc.colSpan > 1) {
          try {
            ws.mergeCells(
              excelRow,
              excelCol,
              excelRow + pc.rowSpan - 1,
              excelCol + pc.colSpan - 1
            );
          } catch {}
        }
      });
    });

    const safeName = `${docTitle.replace(/[^a-z0-9]+/gi, '_')}_${dateStr}.xlsx`.replace(/[^a-z0-9_.-]+/gi, '_');
    const buffer = await wb.xlsx.writeBuffer();
    triggerExcelDownload(buffer as ArrayBuffer, safeName);
    return true;
  } catch (err) {
    console.warn('Styled Excel print export skipped:', err);
    return false;
  }
}

/**
 * Exports HTML string (used by printHtmlViaIframe) into a styled Excel workbook
 */
export async function exportHtmlStringToStyledExcel(title: string, bodyHtml: string): Promise<void> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '-99999px';
  container.style.visibility = 'hidden';
  container.innerHTML = bodyHtml;
  document.body.appendChild(container);
  try {
    await exportActiveDocumentToStyledExcel(container, title);
  } finally {
    try {
      document.body.removeChild(container);
    } catch {}
  }
}

/**
 * Installs a global interceptor on window.print so every Print button across
 * the application exports the displayed document/report table view as a styled
 * Excel (.xlsx) file matching the app layout, while applying clean print styles.
 */
export function installGlobalExcelPrintInterceptor(): void {
  if (typeof window === 'undefined') return;
  const win = window as any;
  if (win.__polycablesExcelPrintInstalled) return;
  win.__polycablesExcelPrintInstalled = true;

  const nativePrint = window.print.bind(window);
  win.__polycablesNativePrint = nativePrint;

  const ensureInternalExcelPrintStyles = (): (() => void) | null => {
    const existingConfigured = document.getElementById('auto-configured-printer-style');
    if (existingConfigured) {
      return null;
    }
    const fallbackStyleId = 'polycables-internal-excel-print-style';
    let styleEl = document.getElementById(fallbackStyleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = fallbackStyleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      @media print {
        *, *::before, *::after {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          background: #ffffff !important;
          color: #000000 !important;
        }
        table:not(.slip-pad-table):not(.printable-slip-pad *) {
          border-collapse: collapse !important;
          font-family: Calibri, "Segoe UI", Arial, sans-serif !important;
        }
        table:not(.slip-pad-table):not(.printable-slip-pad *) th {
          background-color: #E8EEF5 !important;
          color: #000000 !important;
          border: 1px solid #000000 !important;
          font-weight: 700 !important;
        }
        table:not(.slip-pad-table):not(.printable-slip-pad *) td {
          border: 1px solid #000000 !important;
          color: #000000 !important;
        }
      }
    `;
    return () => {
      try {
        document.getElementById(fallbackStyleId)?.remove();
      } catch {}
    };
  };

  window.print = () => {
    const cleanup = ensureInternalExcelPrintStyles();
    exportActiveDocumentToStyledExcel()
      .catch(() => false)
      .finally(() => {
        setTimeout(() => {
          try {
            nativePrint();
          } finally {
            if (cleanup) {
              setTimeout(() => {
                cleanup();
              }, 2000);
            }
          }
        }, 180);
      });
  };
}
