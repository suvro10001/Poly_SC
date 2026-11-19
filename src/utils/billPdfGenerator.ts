import { jsPDF } from 'jspdf';
import { StoredBill, BillHeader, BillLineItem, CompanyDetails } from '../types';
import { formatDateDDMMYY } from './dateUtils';
import { formatDisplayUnit } from './stockHelper';

export interface BillPdfOptions {
  bill: {
    header: BillHeader;
    lines: BillLineItem[];
    grandTotal?: number;
    subtotal?: number;
    discountAmount?: number;
    discountPercent?: number;
    totalCoils?: number;
    inWords?: string;
    company?: CompanyDetails;
    salesCenterName?: string;
  } | StoredBill;
  salesCenterName?: string;
}

/**
 * Generates a clean, professional PDF of a Bill Invoice
 * Returns a base64 Data URI (data:application/pdf;base64,...) and blob
 */
export function generateBillPdf({ bill, salesCenterName }: BillPdfOptions): { dataUri: string; base64: string; fileName: string } {
  const header = bill.header;
  const lines = bill.lines || [];
  const billNo = header.billNo || '01';
  const partyName = header.partyName || 'Customer';
  const partyAddress = header.address || '';
  const dateStr = formatDateDDMMYY(header.date) || header.date || 'N/A';
  const challanNo = header.challanNo || '';
  const refNo = header.refNo || '';
  const orderNumber = header.orderNumber || '';
  const centerName = salesCenterName || 'Madhupur Showroom';

  const subtotal = bill.subtotal !== undefined
    ? bill.subtotal
    : lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  const discountPercent = (bill as any).discountPercent !== undefined
    ? (bill as any).discountPercent
    : (header.discountPercent || 0);

  const discountAmount = bill.discountAmount !== undefined
    ? bill.discountAmount
    : (discountPercent > 0 ? Math.round((subtotal * discountPercent) / 100) : 0);

  const grandTotal = bill.grandTotal !== undefined
    ? bill.grandTotal
    : (subtotal - discountAmount);

  const totalCoils = bill.totalCoils !== undefined
    ? bill.totalCoils
    : lines.reduce((sum, l) => sum + (Number(l.coilQty) || 0), 0);

  const inWords = bill.inWords || '';

  // Create A4 / Custom page portrait PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 14;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, y, pageWidth - (margin * 2), 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('POLY CABLES IND. LTD.', pageWidth / 2, y + 8, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Holding No. 392, Shop No. 3, Sanjoy Smrity Market, Raypara, Madhupur, Tangail.', pageWidth / 2, y + 13, { align: 'center' });
  doc.text(`Sales Center: ${centerName} | Phone: 01713-434290 | info@polycables.com.bd`, pageWidth / 2, y + 18, { align: 'center' });

  y += 26;

  // Title: BILL INVOICE
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.rect(margin, y, pageWidth - (margin * 2), 7, 'FD');

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`BILL INVOICE #${billNo}`, margin + 3, y + 4.8);
  doc.text(`Date: ${dateStr}`, pageWidth - margin - 3, y + 4.8, { align: 'right' });

  y += 10;

  // Customer & Bill Details Box
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageWidth - (margin * 2), 18, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.text('Customer Name:', margin + 3, y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.text(partyName, margin + 30, y + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Address:', margin + 3, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.text(partyAddress || '-', margin + 30, y + 9);

  doc.setFont('helvetica', 'bold');
  doc.text('Sales Center:', margin + 3, y + 13.5);
  doc.setFont('helvetica', 'normal');
  doc.text(centerName, margin + 30, y + 13.5);

  // Right side of details box
  const rightX = pageWidth - margin - 50;
  if (challanNo) {
    doc.setFont('helvetica', 'bold');
    doc.text('Challan No:', rightX, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.text(challanNo, rightX + 20, y + 4.5);
  }
  if (refNo) {
    doc.setFont('helvetica', 'bold');
    doc.text('Ref No:', rightX, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.text(refNo, rightX + 20, y + 9);
  }
  if (orderNumber) {
    doc.setFont('helvetica', 'bold');
    doc.text('Order No:', rightX, y + 13.5);
    doc.setFont('helvetica', 'normal');
    doc.text(orderNumber, rightX + 20, y + 13.5);
  }

  y += 22;

  // Table Columns
  const colSl = margin;
  const colSlW = 10;
  const colDesc = colSl + colSlW;
  const colDescW = 82;
  const colQty = colDesc + colDescW;
  const colQtyW = 20;
  const colUnit = colQty + colQtyW;
  const colUnitW = 18;
  const colRate = colUnit + colUnitW;
  const colRateW = 24;
  const colAmt = colRate + colRateW;
  const colAmtW = pageWidth - margin - colAmt;

  // Table Header
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  doc.text('SL', colSl + (colSlW / 2), y + 4.5, { align: 'center' });
  doc.text('ITEM DESCRIPTION', colDesc + 2, y + 4.5);
  doc.text('QTY', colQty + (colQtyW / 2), y + 4.5, { align: 'center' });
  doc.text('UNIT', colUnit + (colUnitW / 2), y + 4.5, { align: 'center' });
  doc.text('RATE (TK)', colRate + colRateW - 2, y + 4.5, { align: 'right' });
  doc.text('AMOUNT (TK)', colAmt + colAmtW - 2, y + 4.5, { align: 'right' });

  y += 7;

  // Table Rows
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8);

  lines.forEach((line, idx) => {
    const rowHeight = 6.5;
    const isEven = idx % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, y, pageWidth - (margin * 2), rowHeight, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, pageWidth - (margin * 2), rowHeight, 'S');

    doc.setFont('helvetica', 'normal');
    doc.text(String(idx + 1).padStart(2, '0'), colSl + (colSlW / 2), y + 4.3, { align: 'center' });
    
    // Truncate description if too long
    const itemDesc = (line.itemDescription || '').slice(0, 52);
    doc.text(itemDesc, colDesc + 2, y + 4.3);
    
    doc.text(String(line.coilQty || 0), colQty + (colQtyW / 2), y + 4.3, { align: 'center' });
    doc.text(formatDisplayUnit(line.unit, line.coilQty), colUnit + (colUnitW / 2), y + 4.3, { align: 'center' });
    doc.text((Number(line.rate) || 0).toLocaleString('en-IN'), colRate + colRateW - 2, y + 4.3, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(`${(Number(line.amount) || 0).toLocaleString('en-IN')}/-`, colAmt + colAmtW - 2, y + 4.3, { align: 'right' });

    y += rowHeight;
  });

  // Table Summary / Totals
  const totalRowHeight = 6.5;

  // Subtotal & Total Coils
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, pageWidth - (margin * 2), totalRowHeight, 'FD');
  doc.setDrawColor(203, 213, 225);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`Total Coils: ${totalCoils}`, colDesc + 2, y + 4.3);
  doc.text('Subtotal =', colRate - 2, y + 4.3, { align: 'right' });
  doc.text(`${subtotal.toLocaleString('en-IN')}/-`, colAmt + colAmtW - 2, y + 4.3, { align: 'right' });
  y += totalRowHeight;

  // Discount (if any)
  if (discountAmount > 0) {
    doc.setFillColor(254, 242, 242); // rose-50
    doc.rect(margin, y, pageWidth - (margin * 2), totalRowHeight, 'FD');
    doc.setTextColor(185, 28, 28);
    doc.text(`Sales Discount (${discountPercent}%) =`, colRate - 2, y + 4.3, { align: 'right' });
    doc.text(`-${discountAmount.toLocaleString('en-IN')}/-`, colAmt + colAmtW - 2, y + 4.3, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    y += totalRowHeight;
  }

  // Net Grand Total
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, y, pageWidth - (margin * 2), 7.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Grand Total =', colRate - 2, y + 5, { align: 'right' });
  doc.text(`TK ${grandTotal.toLocaleString('en-IN')}/-`, colAmt + colAmtW - 2, y + 5, { align: 'right' });
  y += 11;

  // In Words
  if (inWords) {
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text('In Words:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(inWords, margin + 18, y);
    y += 12;
  } else {
    y += 6;
  }

  // Signatures Section
  const sigY = Math.max(y + 12, 250);
  const sigColW = (pageWidth - (margin * 2)) / 4;

  doc.setDrawColor(148, 163, 184);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);

  const sigLabels = ["Receiver's Signature", "Prepared By", "Checked By", "Approved By"];
  sigLabels.forEach((label, i) => {
    const startX = margin + (i * sigColW) + 4;
    const endX = margin + ((i + 1) * sigColW) - 4;
    doc.line(startX, sigY, endX, sigY);
    doc.text(label, (startX + endX) / 2, sigY + 4, { align: 'center' });
  });

  // Footer note
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.text('House-16, Block-C, Main Road, Aftabnagar, Dhaka-1212 | Web: www.polycables.com.bd', pageWidth / 2, 285, { align: 'center' });

  const fileName = `Bill_Invoice_${billNo}_${partyName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split('base64,')[1] || '';

  return { dataUri, base64, fileName };
}
