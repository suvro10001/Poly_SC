import * as XLSX from 'xlsx';
import { Party, Salesperson } from '../types';

/**
 * Clean Sales Center Name helper
 */
function cleanCenter(raw?: string): string {
  if (!raw) return 'Madhupur Sales Center';
  return raw.replace(/\s*\((?:all|\d+)\)$/i, '').trim();
}

/**
 * Resolve display Sales Center for a party
 */
function resolveSalesCenter(p: Party, salespersons: Salesperson[] = []): string {
  if (p.branchName && p.branchName.trim()) {
    return cleanCenter(p.branchName);
  }
  if (p.salesmanCode) {
    const sp = salespersons.find(
      (s) => s.code.toLowerCase() === p.salesmanCode?.toLowerCase()
    );
    if (sp?.branchName && sp.branchName.trim()) {
      return cleanCenter(sp.branchName);
    }
  }
  return 'Madhupur Sales Center';
}

/**
 * Export Party/Customer Directory to Excel (.xlsx)
 * Exactly: Party name, Address, Phone, Salesperson, Sales Center, Opening Balance
 */
export function exportPartiesToXLSX(parties: Party[], salespersons: Salesperson[] = []) {
  const data = [
    ['Party name', 'Address', 'Phone', 'Salesperson', 'Sales Center', 'Opening Balance'],
    ...parties.map((p) => [
      p.name,
      p.address || '',
      p.phone || p.mobile || '',
      p.salespersonName || (p.salesmanCode ? (salespersons.find(s => s.code.toLowerCase() === p.salesmanCode?.toLowerCase())?.name || p.salesmanCode) : ''),
      resolveSalesCenter(p, salespersons),
      p.openingBalance !== undefined ? p.openingBalance : 0
    ])
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 32 }, // Party name
    { wch: 35 }, // Address
    { wch: 18 }, // Phone
    { wch: 24 }, // Salesperson
    { wch: 26 }, // Sales Center
    { wch: 18 }  // Opening Balance
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Customer_Directory');
  XLSX.writeFile(wb, `Polycables_Customer_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Download Sample Template for Bulk Party Import (.xlsx)
 * Exactly: Party name, Address, Phone, Salesperson, Sales Center, Opening Balance
 */
export function downloadPartyTemplateXLSX() {
  const sampleData = [
    ['Party name', 'Address', 'Phone', 'Salesperson', 'Sales Center', 'Opening Balance'],
    ['Alam Hardware & Electric', 'Madhupur Bazaar, Tangail', '01711000000', 'Sonjoy Chowhan', 'Madhupur Sales Center', 50000],
    ['Sonchita Cable Store', 'Raypara, Madhupur', '01822000000', 'Rahim Uddin', 'Madhupur Sales Center', 0],
    ['Bhai Bhai Electric World', 'Station Road, Tangail', '01933000000', 'Kamal Hossain', 'Tangail Sales Center', 25000]
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sampleData);

  ws['!cols'] = [
    { wch: 30 },
    { wch: 32 },
    { wch: 18 },
    { wch: 22 },
    { wch: 26 },
    { wch: 18 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Sample_Customer_Import');
  XLSX.writeFile(wb, 'Customer_Import_Template.xlsx');
}

export interface SimilarSalespersonMatch {
  rawName: string;
  matchedSalesperson: Salesperson;
  similarity: number;
  partyIds: string[];
}

export interface ParseXLSXPartiesResult {
  importedParties: Party[];
  count: number;
  similarSalespersons: SimilarSalespersonMatch[];
}

export function calculateSalespersonSimilarity(raw: string, target: string): number {
  const clean = (s: string) =>
    s.toLowerCase().replace(/^(md\.|mohammed|mohammad|engr\.|adv\.|mr\.)\s*/i, '').replace(/[^a-z0-9\s]/g, '').trim();

  const cRaw = clean(raw);
  const cTarget = clean(target);
  if (!cRaw || !cTarget) return 0;
  if (cRaw === cTarget) return 1.0;

  // Exact word boundary or inclusion
  if (cRaw.length >= 3 && cTarget.length >= 3) {
    if (cTarget.includes(cRaw) || cRaw.includes(cTarget)) {
      const ratio = Math.min(cRaw.length, cTarget.length) / Math.max(cRaw.length, cTarget.length);
      return Math.max(0.7, ratio);
    }
  }

  // Common word tokens (e.g. Sonjoy vs Sonjoy Chowhan)
  const rawWords = cRaw.split(/\s+/).filter((w) => w.length > 2);
  const targetWords = cTarget.split(/\s+/).filter((w) => w.length > 2);
  const hasCommon = rawWords.some((rw) => targetWords.some((tw) => rw === tw || rw.startsWith(tw) || tw.startsWith(rw)));
  if (hasCommon) return 0.78;

  // Levenshtein distance
  const track = Array(cTarget.length + 1).fill(null).map(() =>
    Array(cRaw.length + 1).fill(null)
  );
  for (let i = 0; i <= cRaw.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= cTarget.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= cTarget.length; j += 1) {
    for (let i = 1; i <= cRaw.length; i += 1) {
      const indicator = cRaw[i - 1] === cTarget[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }
  const dist = track[cTarget.length][cRaw.length];
  const maxLen = Math.max(cRaw.length, cTarget.length);
  return 1 - dist / maxLen;
}

/**
 * Parse uploaded XLSX or XLS file to extract Parties/Customers
 * Columns: Party name, Address, Phone, Salesperson, Sales Center, Opening Balance
 */
export async function parseXLSXToParties(
  file: File,
  salespersons: Salesperson[] = []
): Promise<ParseXLSXPartiesResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        if (!buffer) {
          reject(new Error('Failed to read file content'));
          return;
        }

        const wb = XLSX.read(buffer, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          reject(new Error('No sheets found in Excel file'));
          return;
        }

        const worksheet = wb.Sheets[sheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawRows || rawRows.length === 0) {
          resolve({ importedParties: [], count: 0, similarSalespersons: [] });
          return;
        }

        // Search for header row
        let headerRowIndex = -1;
        let nameIdx = -1;
        let addressIdx = -1;
        let phoneIdx = -1;
        let salesmanIdx = -1;
        let salesCenterIdx = -1;
        let openingBalanceIdx = -1;

        for (let r = 0; r < Math.min(10, rawRows.length); r++) {
          const row = rawRows[r];
          if (!row || !Array.isArray(row)) continue;

          const strRow = row.map((cell) => String(cell || '').toLowerCase().trim());
          const nIdx = strRow.findIndex((c) => c.includes('party') || c.includes('customer') || c.includes('name') || c.includes('shop') || c.includes('client'));
          
          if (nIdx !== -1) {
            headerRowIndex = r;
            nameIdx = nIdx;
            addressIdx = strRow.findIndex((c) => c.includes('address') || c.includes('location') || c.includes('place') || c.includes('area'));
            phoneIdx = strRow.findIndex((c) => c.includes('phone') || c.includes('mobile') || c.includes('contact') || c.includes('tel') || c.includes('number'));
            salesCenterIdx = strRow.findIndex((c) => c.includes('center') || c.includes('sales center') || c.includes('branch') || c.includes('showroom'));
            salesmanIdx = strRow.findIndex((c) => (c.includes('salesperson') || c.includes('salesman') || c.includes('rep') || c.includes('marketing') || c.includes('officer')) && !c.includes('center'));
            openingBalanceIdx = strRow.findIndex((c) => c.includes('opening') || c.includes('balance') || c.includes('op bal') || c.includes('due'));
            break;
          }
        }

        const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;
        if (nameIdx === -1) {
          nameIdx = 0; // fallback to first column
        }

        const importedParties: Party[] = [];
        const similarMap = new Map<string, SimilarSalespersonMatch>();

        for (let i = startRow; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;

          const rawName = row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : '';
          // Ignore empty or title/header rows
          if (!rawName || rawName.toLowerCase().startsWith('customer name') || rawName.toLowerCase().startsWith('party name') || rawName.toLowerCase().startsWith('sl')) {
            continue;
          }

          const address = addressIdx !== -1 && row[addressIdx] !== undefined ? String(row[addressIdx]).trim() : '';
          const phone = phoneIdx !== -1 && row[phoneIdx] !== undefined ? String(row[phoneIdx]).trim() : '';
          const rawSalesperson = salesmanIdx !== -1 && row[salesmanIdx] !== undefined ? String(row[salesmanIdx]).trim() : '';
          const rawSalesCenter = salesCenterIdx !== -1 && row[salesCenterIdx] !== undefined ? String(row[salesCenterIdx]).trim() : '';

          let openingBalance = 0;
          if (openingBalanceIdx !== -1 && row[openingBalanceIdx] !== undefined) {
            const rawVal = row[openingBalanceIdx];
            if (typeof rawVal === 'number') {
              openingBalance = isNaN(rawVal) ? 0 : rawVal;
            } else {
              const cleaned = String(rawVal).replace(/[^0-9.-]/g, '').trim();
              const parsed = parseFloat(cleaned);
              openingBalance = !isNaN(parsed) ? parsed : 0;
            }
          }

          const partyId = `party-xlsx-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`;

          // Resolve Salesperson Name and Code
          let salesmanCode = '';
          let salespersonName = rawSalesperson;

          if (rawSalesperson) {
            const rawSpLower = rawSalesperson.toLowerCase().trim();
            // Check exact code match or exact name match
            const exactMatch = salespersons.find(
              (s) => s.code.toLowerCase().trim() === rawSpLower || s.name.toLowerCase().trim() === rawSpLower
            );

            if (exactMatch) {
              salesmanCode = exactMatch.code;
              salespersonName = exactMatch.name;
            } else {
              // Check for similar salesperson in directory
              let bestMatch: Salesperson | null = null;
              let bestSim = 0;

              for (const s of salespersons) {
                const sim = calculateSalespersonSimilarity(rawSalesperson, s.name);
                if (sim > bestSim && sim >= 0.6) {
                  bestSim = sim;
                  bestMatch = s;
                }
              }

              if (bestMatch) {
                const existingEntry = similarMap.get(rawSalesperson);
                if (existingEntry) {
                  existingEntry.partyIds.push(partyId);
                } else {
                  similarMap.set(rawSalesperson, {
                    rawName: rawSalesperson,
                    matchedSalesperson: bestMatch,
                    similarity: bestSim,
                    partyIds: [partyId]
                  });
                }
              }
            }
          }

          // Resolve Sales Center
          let branchName = rawSalesCenter || '';
          if (!branchName && salesmanCode) {
            const matchedSp = salespersons.find((s) => s.code.toLowerCase() === salesmanCode.toLowerCase());
            if (matchedSp?.branchName) {
              branchName = matchedSp.branchName;
            }
          }
          if (!branchName) {
            branchName = 'Madhupur Sales Center';
          }
          branchName = cleanCenter(branchName);

          importedParties.push({
            id: partyId,
            name: rawName,
            address: address,
            phone: phone,
            salesmanCode: salesmanCode || undefined,
            salespersonName: salespersonName || undefined,
            branchName: branchName,
            openingBalance: openingBalance
          });
        }

        resolve({
          importedParties,
          count: importedParties.length,
          similarSalespersons: Array.from(similarMap.values())
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read Excel file'));
    reader.readAsArrayBuffer(file);
  });
}

