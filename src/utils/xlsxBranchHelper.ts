import * as XLSX from 'xlsx';
import { BranchLocation, BranchType, Salesperson } from '../types';

/**
 * Export Showroom / Branch Directory to Excel (.xlsx)
 */
export function exportBranchesToXLSX(branches: BranchLocation[]) {
  const data = [
    ['Showroom / Branch Name', 'Branch Type', 'Address / Location', 'Mobile / Phone Number', 'Email', 'In-Charge Name', 'In-Charge Phone', 'Approver Name', 'Status'],
    ...branches.map((b) => [
      b.name,
      b.type === 'head_office' ? 'Head Office' : b.type === 'power_market' ? 'Power Market' : b.type === 'other' ? 'Other' : 'Showroom',
      b.address || '',
      b.phone || '',
      b.email || '',
      b.inChargeName || '',
      b.inChargePhone || '',
      b.approverName || '',
      b.isActive !== false ? 'Active' : 'Inactive'
    ])
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 35 }, // Showroom Name
    { wch: 18 }, // Type
    { wch: 38 }, // Address
    { wch: 20 }, // Phone
    { wch: 25 }, // Email
    { wch: 25 }, // In-Charge
    { wch: 20 }, // In-Charge Phone
    { wch: 28 }, // Approver Name
    { wch: 12 }  // Status
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Showrooms_List');
  XLSX.writeFile(wb, `Polycables_Showrooms_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Download Simple Sample Template (Just Sales Center Name & Address)
 */
export function downloadSimpleBranchTemplateXLSX() {
  const sampleData = [
    ['Sales Center Name', 'Address'],
    ['Madhupur Sales Center', 'Madhupur Bazaar, Madhupur, Tangail'],
    ['Tangail Sales Center', 'Station Road, Victoria Road, Tangail'],
    ['Bogra Sales Center', 'Barogola, Bogra Sadar, Bogra'],
    ['Rangpur Sales Center', 'Station Road, Jahaj Company More, Rangpur'],
    ['Mymensingh Sales Center', 'Choto Bazar, Mymensingh Sadar']
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sampleData);

  ws['!cols'] = [
    { wch: 35 }, // Sales Center Name
    { wch: 45 }  // Address
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Sales_Centers');
  XLSX.writeFile(wb, 'Sales_Centers_Name_Address_Template.xlsx');
}

/**
 * Download Sample Template for Bulk Showrooms Upload
 */
export function downloadBranchTemplateXLSX() {
  const sampleData = [
    ['Sales Center / Showroom Name', 'Address / Location', 'Branch Type', 'Mobile / Phone Number', 'Email', 'In-Charge Name', 'In-Charge Phone', 'Approver Name', 'Status'],
    ['Madhupur Sales Center / Showroom', 'Madhupur Bazaar, Tangail', 'Showroom', '01711-000000', 'madhupur@polycables.com', '', '', '', 'Active'],
    ['Tangail Sales Center / Showroom', 'Station Road, Tangail', 'Showroom', '01722-000000', 'tangail@polycables.com', '', '', '', 'Active'],
    ['Head Office Sales Division', '125, Nawabpur Road, Dhaka', 'Head Office', '01733-000000', 'headoffice@polycables.com', '', '', '', 'Active'],
    ['Nawabpur Power Market Outlet', 'Shop #14, Nawabpur Electric Market, Dhaka', 'Power Market', '01744-000000', 'nawabpur@polycables.com', '', '', '', 'Active']
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sampleData);

  ws['!cols'] = [
    { wch: 35 },
    { wch: 38 },
    { wch: 18 },
    { wch: 20 },
    { wch: 25 },
    { wch: 25 },
    { wch: 20 },
    { wch: 28 },
    { wch: 12 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Showroom_Template');
  XLSX.writeFile(wb, 'Showrooms_List_Template.xlsx');
}

/**
 * Parse uploaded XLSX or XLS file to extract Showrooms / Branches
 */
export async function parseXLSXToBranches(
  file: File,
  existingBranches: BranchLocation[] = [],
  salespersons: Salesperson[] = []
): Promise<{
  importedBranches: BranchLocation[];
  mergedBranches: BranchLocation[];
  count: number;
  addedCount: number;
  updatedCount: number;
}> {
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
          resolve({ importedBranches: [], mergedBranches: existingBranches, count: 0, addedCount: 0, updatedCount: 0 });
          return;
        }

        // Search for header row
        let headerRowIndex = -1;
        let nameIdx = -1;
        let typeIdx = -1;
        let addressIdx = -1;
        let phoneIdx = -1;
        let emailIdx = -1;
        let inChargeNameIdx = -1;
        let inChargePhoneIdx = -1;
        let approverIdx = -1;
        let statusIdx = -1;

        for (let r = 0; r < Math.min(10, rawRows.length); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;

          row.forEach((cell, cIdx) => {
            const val = String(cell || '').trim().toLowerCase();
            // Name detection
            if (
              val.includes('sales center') ||
              val.includes('sales centre') ||
              val.includes('salescenter') ||
              val.includes('center name') ||
              val.includes('centre name') ||
              val.includes('showroom') ||
              val.includes('branch') ||
              val.includes('outlet') ||
              val === 'center' ||
              val === 'centre' ||
              val === 'name'
            ) {
              if (nameIdx === -1 && !val.includes('type') && !val.includes('in-charge') && !val.includes('incharge') && !val.includes('approver') && !val.includes('address')) {
                nameIdx = cIdx;
              }
            }
            // Address detection
            if (val.includes('address') || val.includes('location') || val.includes('addr') || val.includes('thana') || val.includes('district') || val.includes('place')) {
              if (addressIdx === -1) {
                addressIdx = cIdx;
              }
            }
            if (val.includes('type') || val.includes('category')) {
              typeIdx = cIdx;
            }
            if (val.includes('mobile') || val.includes('phone') || val.includes('contact') || val.includes('cell')) {
              if (!val.includes('in-charge') && !val.includes('incharge') && phoneIdx === -1) {
                phoneIdx = cIdx;
              } else if ((val.includes('in-charge') || val.includes('incharge')) && inChargePhoneIdx === -1) {
                inChargePhoneIdx = cIdx;
              }
            }
            if (val.includes('email') || val.includes('mail')) {
              emailIdx = cIdx;
            }
            if ((val.includes('in-charge') || val.includes('incharge') || val.includes('manager') || val.includes('officer')) && !val.includes('phone') && !val.includes('mobile')) {
              inChargeNameIdx = cIdx;
            }
            if (val.includes('approver')) {
              approverIdx = cIdx;
            }
            if (val.includes('status') || val.includes('active')) {
              statusIdx = cIdx;
            }
          });

          // Found header if name column identified or address column identified
          if (nameIdx !== -1 || addressIdx !== -1) {
            headerRowIndex = r;
            break;
          }
        }

        // If no explicit header was identified, check if row 0 looks like header text
        let dataStartIndex = 0;
        if (headerRowIndex !== -1) {
          dataStartIndex = headerRowIndex + 1;
        } else {
          const firstRow = rawRows[0] || [];
          const r0Text = firstRow.map((c) => String(c || '').toLowerCase()).join(' ');
          if (r0Text.includes('name') || r0Text.includes('center') || r0Text.includes('address') || r0Text.includes('branch')) {
            dataStartIndex = 1;
          }
        }

        // Setup column indices with smart fallbacks
        const actualNameIdx = nameIdx !== -1 ? nameIdx : 0;
        // If addressIdx was found, use it. If not, and there are at least 2 columns, column 1 is address!
        const actualAddressIdx = addressIdx !== -1 ? addressIdx : 1;
        const actualTypeIdx = typeIdx;
        const actualPhoneIdx = phoneIdx;
        const actualEmailIdx = emailIdx;
        const actualInChargeNameIdx = inChargeNameIdx;
        const actualInChargePhoneIdx = inChargePhoneIdx;
        const actualApproverIdx = approverIdx;
        const actualStatusIdx = statusIdx;

        const importedBranches: BranchLocation[] = [];
        let addedCount = 0;
        let updatedCount = 0;

        for (let r = dataStartIndex; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || !Array.isArray(row)) continue;

          const rawName = row[actualNameIdx];
          if (!rawName) continue;
          const name = String(rawName).trim();
          if (
            !name ||
            name.toLowerCase().includes('showroom / branch') ||
            name.toLowerCase() === 'name' ||
            name.toLowerCase() === 'sales center name' ||
            name.toLowerCase() === 'branch name'
          ) {
            continue;
          }

          // Branch Type detection
          let type: BranchType = 'showroom';
          if (actualTypeIdx !== -1 && actualTypeIdx !== undefined) {
            const rawType = String(row[actualTypeIdx] || '').trim().toLowerCase();
            if (rawType.includes('head') || rawType.includes('office')) {
              type = 'head_office';
            } else if (rawType.includes('power') || rawType.includes('market')) {
              type = 'power_market';
            } else if (rawType.includes('other')) {
              type = 'other';
            }
          }

          const rawAddress = actualAddressIdx !== -1 && actualAddressIdx !== undefined && actualAddressIdx !== actualNameIdx
            ? String(row[actualAddressIdx] || '').trim()
            : '';
          const address = rawAddress;

          const phone = actualPhoneIdx !== -1 && actualPhoneIdx !== undefined ? String(row[actualPhoneIdx] || '').trim() : '';
          const email = actualEmailIdx !== -1 && actualEmailIdx !== undefined ? String(row[actualEmailIdx] || '').trim() : '';
          const rawInCharge = actualInChargeNameIdx !== -1 && actualInChargeNameIdx !== undefined ? String(row[actualInChargeNameIdx] || '').trim() : '';
          const inChargePhone = actualInChargePhoneIdx !== -1 && actualInChargePhoneIdx !== undefined ? String(row[actualInChargePhoneIdx] || '').trim() : '';
          const approverName = actualApproverIdx !== -1 && actualApproverIdx !== undefined ? String(row[actualApproverIdx] || '').trim() : '';
          const rawStatus = actualStatusIdx !== -1 && actualStatusIdx !== undefined ? String(row[actualStatusIdx] || '').trim().toLowerCase() : '';
          const isActive = rawStatus === 'inactive' || rawStatus === 'false' || rawStatus === 'no' ? false : true;

          // Match in-charge from salespersons directory
          let inChargeId: string | undefined = undefined;
          let inChargeName: string | undefined = rawInCharge || undefined;
          let finalInChargePhone = inChargePhone;

          if (rawInCharge) {
            const matchedSp = salespersons.find(
              (s) =>
                s.name.trim().toLowerCase() === rawInCharge.toLowerCase() ||
                (s.code && s.code.trim().toLowerCase() === rawInCharge.toLowerCase()) ||
                rawInCharge.toLowerCase().includes(s.name.trim().toLowerCase())
            );
            if (matchedSp) {
              inChargeId = matchedSp.id;
              inChargeName = matchedSp.name;
              if (!finalInChargePhone && matchedSp.phone) {
                finalInChargePhone = matchedSp.phone;
              }
            }
          }

          // Check if already exists in existingBranches
          const existing = existingBranches.find(
            (b) =>
              b.name.trim().toLowerCase() === name.toLowerCase() ||
              (b.name.trim().toLowerCase().replace(/ sales center| showroom| outlet/g, '') === name.toLowerCase().replace(/ sales center| showroom| outlet/g, '') && name.length > 3)
          );

          if (existing) {
            updatedCount++;
            importedBranches.push({
              ...existing,
              name,
              type: actualTypeIdx !== -1 && actualTypeIdx !== undefined ? type : existing.type,
              address: address || existing.address,
              phone: phone || existing.phone,
              email: email || existing.email,
              inChargeId: inChargeId || existing.inChargeId,
              inChargeName: inChargeName || existing.inChargeName,
              inChargePhone: finalInChargePhone || existing.inChargePhone,
              approverName: approverName || existing.approverName,
              isActive
            });
          } else {
            addedCount++;
            importedBranches.push({
              id: `branch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name,
              type,
              address,
              phone,
              email,
              inChargeId,
              inChargeName,
              inChargePhone: finalInChargePhone,
              approverName: approverName || '',
              isActive
            });
          }
        }

        // Build merged branches list
        const mergedBranches: BranchLocation[] = [...existingBranches];
        for (const imp of importedBranches) {
          const idx = mergedBranches.findIndex((b) => b.id === imp.id || b.name.trim().toLowerCase() === imp.name.trim().toLowerCase());
          if (idx >= 0) {
            mergedBranches[idx] = imp;
          } else {
            mergedBranches.push(imp);
          }
        }

        resolve({
          importedBranches,
          mergedBranches,
          count: importedBranches.length,
          addedCount,
          updatedCount
        });
      } catch (err: any) {
        reject(new Error(err?.message || 'Failed to parse Excel file'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file from disk'));
    };

    reader.readAsArrayBuffer(file);
  });
}
