import * as XLSX from 'xlsx';
import { BillHeader, BillLineItem, CompanyDetails, Item } from '../types';
import { convertToTakaWords } from './numberToWords';

export function exportBillToExcel(
  company: CompanyDetails,
  header: BillHeader,
  lines: BillLineItem[],
  itemsList: Item[]
) {
  // Calculate total
  const grandTotal = lines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const inWordsText = convertToTakaWords(grandTotal);

  // Build Sheet 1 (Bill Format)
  const sheet1Data: (string | number)[][] = [
    [company.name],
    [company.address],
    [`Mob: ${company.phone}`],
    [`E-mail: ${company.email}`],
    [''],
    ['Party Name:', header.partyName, '', 'Order Number :', header.orderNumber, 'Date:', header.date],
    ['Address :', header.address, '', 'Bill No :', header.billNo, 'Date:', header.date],
    ['', '', '', 'Challan No. :', header.challanNo, 'Date:', header.date],
    ['', '', '', 'Ref. No. :', header.refNo],
    ['', '', '', 'Salesman Code :', header.salesmanCode],
    [''],
    ['SL', 'Item Description', 'Size / Spec', 'Coil / Qty', 'Rate (Tk)', 'Amount (Tk)']
  ];

  lines.forEach((l, idx) => {
    sheet1Data.push([
      idx + 1,
      l.itemDescription || '',
      l.sizeSpec || '',
      l.coilQty || 0,
      l.rate || 0,
      l.amount || 0
    ]);
  });

  // Pad to at least 10 rows for clean bill format look
  const currentLinesCount = lines.length;
  for (let i = currentLinesCount; i < 12; i++) {
    sheet1Data.push([i + 1, '', '', '', '', '']);
  }

  // Add Total row
  sheet1Data.push(['', '', '', '', 'Total:', grandTotal]);
  sheet1Data.push(['In Word:', inWordsText]);
  sheet1Data.push(['']);
  sheet1Data.push(['']);
  sheet1Data.push(["Receiver's Signature", '', 'Prepared By', '', 'Check By', '', 'Approved By']);

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

  // Set column widths for Sheet 1
  ws1['!cols'] = [
    { wch: 6 },  // SL
    { wch: 35 }, // Item Description
    { wch: 20 }, // Size / Spec
    { wch: 12 }, // Coil / Qty
    { wch: 14 }, // Rate
    { wch: 16 }  // Amount
  ];

  XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1_Bill');

  // Build Sheet 2 (Item Master)
  const sheet2Data: (string | number)[][] = [
    ['Item Code', 'Item Name', 'Size / Specification', 'Unit', 'Rate (Tk)', 'Category'],
    ...itemsList.map(item => [
      item.code,
      item.name,
      item.sizeSpec,
      item.unit,
      item.rate,
      item.category
    ])
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [
    { wch: 12 },
    { wch: 35 },
    { wch: 22 },
    { wch: 10 },
    { wch: 12 },
    { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2_Items');

  // Save Excel file
  const fileName = `Bill_${header.billNo || 'Export'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
