import * as XLSX from 'xlsx';
import { Item } from '../types';

/**
 * Parses an Excel (.xlsx, .xls) or CSV file to extract category names.
 * Supports files with standard headers (e.g. "Category", "Category Name", "CategoryName", "Group")
 * or single-column files where each row is a category name.
 */
export async function parseXLSXToCategories(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          resolve([]);
          return;
        }

        // Read the first worksheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          resolve([]);
          return;
        }

        // Convert worksheet to 2D array of rows
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (!rows || rows.length === 0) {
          resolve([]);
          return;
        }

        const foundCategories: string[] = [];
        const seen = new Set<string>();

        // Check if row 0 contains headers
        let categoryColIndex = -1;
        const firstRow = rows[0] || [];
        for (let col = 0; col < firstRow.length; col++) {
          const val = String(firstRow[col] || '').trim().toLowerCase();
          if (
            val === 'category' ||
            val === 'category name' ||
            val === 'category_name' ||
            val === 'categoryname' ||
            val === 'group' ||
            val === 'type' ||
            val === 'item category'
          ) {
            categoryColIndex = col;
            break;
          }
        }

        const startRow = categoryColIndex >= 0 ? 1 : 0;
        const targetCol = categoryColIndex >= 0 ? categoryColIndex : 0;

        for (let r = startRow; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row)) continue;

          let catCandidate = '';
          if (categoryColIndex >= 0) {
            catCandidate = String(row[targetCol] || '').trim();
          } else {
            // Find first non-empty text column
            for (let c = 0; c < row.length; c++) {
              const cellVal = String(row[c] || '').trim();
              if (cellVal && isNaN(Number(cellVal))) {
                catCandidate = cellVal;
                break;
              }
            }
          }

          // Clean up category string
          const cleaned = catCandidate
            .replace(/^[\d.)\s-]+/, '') // remove leading numbering like "1. " or "2) "
            .trim();

          if (cleaned && cleaned.length >= 2 && !seen.has(cleaned.toLowerCase())) {
            // Filter out common table headers if row 0 was not identified
            const lower = cleaned.toLowerCase();
            if (
              lower !== 'sl' &&
              lower !== 'sl no' &&
              lower !== 'sl.' &&
              lower !== 'serial' &&
              lower !== 'category' &&
              lower !== 'category name' &&
              lower !== 'total' &&
              lower !== 'grand total'
            ) {
              seen.add(lower);
              foundCategories.push(cleaned);
            }
          }
        }

        resolve(foundCategories);
      } catch (err) {
        console.error('Error parsing categories Excel file:', err);
        reject(err);
      }
    };

    reader.onerror = (err) => {
      reject(err);
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Exports current categories list to an Excel (.xlsx) file with statistics.
 */
export function exportCategoriesToXLSX(categories: string[], items: Item[] = []): void {
  try {
    const headerRow = ['SL No', 'Category Name', 'Total Items'];
    const dataRows = (categories || []).map((cat, idx) => {
      const count = items.filter(
        (i) => (i.category || '').trim().toLowerCase() === cat.trim().toLowerCase()
      ).length;
      return [idx + 1, cat, count];
    });

    const worksheetData = [headerRow, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths
    ws['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 15 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Category List');

    const fileName = `PolyCables_Category_List_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  } catch (err) {
    console.error('Error exporting category list to XLSX:', err);
  }
}
