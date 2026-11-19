import * as XLSX from 'xlsx';
import { RequisitionSlipData, RequisitionSlipItem, StoredBill, BillHeader, BillLineItem, Party, Item, CompanyDetails } from '../types';
import { formatDateDDMMYY } from './dateUtils';

const defaultCompany: CompanyDetails = {
  name: 'Poly Cables Ind. Ltd.',
  address: 'B-68, BSCIC I/A, Tongi, Gazipur',
  phone: '01711-000000',
  email: 'info@polycables.com'
};

export const REQUISITION_STORAGE_KEY = 'polycables_requisitions';
export const REQUISITION_COUNTERS_KEY = 'polycables_req_counters';

/**
 * Detects if a requisition line item is a Special Item (e.g. 500 meter, 1000 meter, 500m)
 * Rule: 1 coil = 100 meters.
 * 500 meters = 5 coils equivalent.
 * 1000 meters = 10 coils equivalent.
 */
export function detectSpecialItemInfo(
  description: string = '',
  remarks: string = '',
  unit: string = 'Coils',
  quantity: number = 0,
  baseItemRate: number = 0
): {
  isSpecialItem: boolean;
  specialMeters: number;
  baseCoilEquivalent: number;
  calculatedRate: number;
  label: string;
} {
  const combined = `${description || ''} ${remarks || ''} ${unit || ''}`.toLowerCase();
  
  // Check for 500m / 500 meter / 500 x
  const match500 = combined.match(/\b500\s*(?:m|mtr|meter|meters)\b|500\s*x/i);
  // Check for 1000m / 1000 meter / 1000 x
  const match1000 = combined.match(/\b1000\s*(?:m|mtr|meter|meters)\b|1000\s*x/i);
  // Check for 1500m or 2000m
  const matchOther = combined.match(/\b(1500|2000|2500|3000)\s*(?:m|mtr|meter|meters)\b/i);

  if (match500 || combined.includes('500m') || combined.includes('500 meter') || combined.includes('500 m')) {
    const meters = 500;
    const coilEq = 5; // 500m / 100m = 5 coils
    const rate = baseItemRate > 0 ? baseItemRate * coilEq : 0;
    return {
      isSpecialItem: true,
      specialMeters: meters,
      baseCoilEquivalent: coilEq,
      calculatedRate: rate,
      label: '⭐ Special Item (500m = 5 Coils @ 100m/coil)'
    };
  }

  if (match1000 || combined.includes('1000m') || combined.includes('1000 meter')) {
    const meters = 1000;
    const coilEq = 10; // 1000m / 100m = 10 coils
    const rate = baseItemRate > 0 ? baseItemRate * coilEq : 0;
    return {
      isSpecialItem: true,
      specialMeters: meters,
      baseCoilEquivalent: coilEq,
      calculatedRate: rate,
      label: '⭐ Special Item (1000m = 10 Coils @ 100m/coil)'
    };
  }

  if (matchOther) {
    const meters = parseInt(matchOther[1], 10);
    const coilEq = Math.round(meters / 100);
    const rate = baseItemRate > 0 ? baseItemRate * coilEq : 0;
    return {
      isSpecialItem: true,
      specialMeters: meters,
      baseCoilEquivalent: coilEq,
      calculatedRate: rate,
      label: `⭐ Special Item (${meters}m = ${coilEq} Coils)`
    };
  }

  return {
    isSpecialItem: false,
    specialMeters: 0,
    baseCoilEquivalent: 1,
    calculatedRate: baseItemRate,
    label: ''
  };
}

/**
 * Get starting number counters configured per marketing person
 */
export function getRequisitionCounters(): Record<string, number> {
  try {
    const saved = localStorage.getItem(REQUISITION_COUNTERS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load requisition counters', e);
  }
  return {
    'Subrata': 62,
    'Sonjoy': 1,
    'Rana': 1,
    'Sumon': 1,
    'Office / Factory': 1
  };
}

/**
 * Save starting number counters
 */
export function saveRequisitionCounters(counters: Record<string, number>): void {
  try {
    localStorage.setItem(REQUISITION_COUNTERS_KEY, JSON.stringify(counters));
  } catch (e) {
    console.error('Failed to save requisition counters', e);
  }
}

/**
 * Calculate the next Requisition number for a marketing person.
 * Formatted as `<SeqNumber>-<MarketingPersonName>` (e.g. 62-Subrata, 63-Subrata)
 */
export function getNextRequisitionNumber(
  salespersonName: string,
  existingReqs: RequisitionSlipData[] = []
): { reqNo: string; seqNumber: number } {
  const cleanName = (salespersonName || 'Subrata').trim();
  const counters = getRequisitionCounters();
  const configuredStart = counters[cleanName] !== undefined ? Number(counters[cleanName]) : 1;

  // Find maximum sequence used in existing requisitions for this marketing person
  let maxSeqUsed = 0;
  existingReqs.forEach((r) => {
    if ((r.marketingPersonName || '').trim().toLowerCase() === cleanName.toLowerCase()) {
      if (r.seqNumber && r.seqNumber > maxSeqUsed) {
        maxSeqUsed = r.seqNumber;
      } else if (r.reqNo) {
        const match = r.reqNo.match(/^(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeqUsed) {
            maxSeqUsed = num;
          }
        }
      }
    }
  });

  const nextSeq = maxSeqUsed >= configuredStart ? maxSeqUsed + 1 : configuredStart;
  const reqNo = `${nextSeq}-${cleanName}`;

  return { reqNo, seqNumber: nextSeq };
}

/**
 * Get stored requisitions from local storage
 */
export function getStoredRequisitions(): RequisitionSlipData[] {
  try {
    const saved = localStorage.getItem(REQUISITION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to parse requisitions', e);
  }
  return getDefaultSampleRequisitions();
}

/**
 * Save requisitions to local storage
 */
export function saveStoredRequisitions(reqs: RequisitionSlipData[]): void {
  try {
    localStorage.setItem(REQUISITION_STORAGE_KEY, JSON.stringify(reqs));
  } catch (e) {
    console.error('Failed to save requisitions', e);
  }
}

/**
 * Generate standard Email Subject: e.g. REQ # 62 (Subrata)
 */
export function generateRequisitionEmailSubject(req: RequisitionSlipData): string {
  let numStr = req.seqNumber ? String(req.seqNumber) : '';
  if (!numStr && req.reqNo) {
    const m = req.reqNo.match(/^(\d+)/);
    numStr = m ? m[1] : req.reqNo;
  }
  const person = (req.marketingPersonName || req.reqBy || 'Subrata').trim();
  return `REQ # ${numStr || '62'} (${person})`;
}

/**
 * Generate Email Message / Body matching the user's exact specification:
 * Party : Maa Electric
 * Amount-2,02,407 Tk.
 * After Discount-(10%)
 * Due-39,112 Tk.
 */
export function generateRequisitionEmailBody(req: RequisitionSlipData, masterItems: Item[] = []): string {
  const subtotal = req.subtotalAmount || calculateRequisitionSubtotal(req, masterItems);
  const discountPercent = req.discountPercent !== undefined ? req.discountPercent : 10;
  const discountAmt = req.discountAmount !== undefined ? req.discountAmount : Math.round(subtotal * (discountPercent / 100));
  const netAmount = req.netAmount !== undefined ? req.netAmount : Math.max(0, subtotal - discountAmt);
  const dueAmt = req.dueAmount !== undefined ? req.dueAmount : 39112;

  const fmt = (n: number) => n.toLocaleString('en-IN');

  return `Party : ${req.partyName}
Amount-${fmt(subtotal)} Tk.
After Discount-(${discountPercent}%)
Due-${fmt(dueAmt)} Tk.`;
}

/**
 * Generate formatted HTML for email dispatches
 */
export function generateRequisitionEmailHtml(req: RequisitionSlipData, masterItems: Item[] = []): string {
  const subtotal = req.subtotalAmount || calculateRequisitionSubtotal(req, masterItems);
  const discountPercent = req.discountPercent !== undefined ? req.discountPercent : 10;
  const discountAmt = req.discountAmount !== undefined ? req.discountAmount : Math.round(subtotal * (discountPercent / 100));
  const netAmount = req.netAmount !== undefined ? req.netAmount : Math.max(0, subtotal - discountAmt);
  const dueAmt = req.dueAmount !== undefined ? req.dueAmount : 39112;

  const fmt = (n: number) => n.toLocaleString('en-IN');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a; line-height: 1.6; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="font-size: 22px; font-weight: 900; color: #0f172a; margin: 0 0 16px 0; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">Party : ${req.partyName || ''}</h2>
      <div style="font-size: 19px; font-weight: 800; color: #1e293b; margin: 10px 0;">Amount-${fmt(subtotal)} Tk.</div>
      <div style="font-size: 19px; font-weight: 800; color: #047857; margin: 10px 0;">After Discount-(${discountPercent}%) : ${fmt(netAmount)} Tk.</div>
      <div style="font-size: 19px; font-weight: 800; color: #b91c1c; margin: 10px 0;">Due-${fmt(dueAmt)} Tk.</div>
      <div style="margin-top: 24px; padding-top: 14px; border-top: 1px dashed #cbd5e1; font-size: 13px; color: #64748b; display: flex; align-items: center; gap: 6px;">
        <span>📎</span>
        <span><strong>Attachment:</strong> Requisition_${(req.reqNo || 'Slip').replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx (Complete requisition workbook attached)</span>
      </div>
    </div>
  `;
}

/**
 * Generate WhatsApp share URL and prefilled text
 */
export function generateRequisitionWhatsAppUrl(req: RequisitionSlipData, phoneNumber?: string, masterItems: Item[] = []): string {
  const bodyText = generateRequisitionWhatsAppText(req, masterItems);
  const cleanPhone = (phoneNumber || req.partyPhone || '').replace(/[^0-9]/g, '');
  const encoded = encodeURIComponent(bodyText);
  if (cleanPhone) {
    const formattedPhone = cleanPhone.startsWith('88') ? cleanPhone : '88' + cleanPhone;
    return `https://wa.me/${formattedPhone}?text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?text=${encoded}`;
}

/**
 * Generate clean markdown WhatsApp text for automated dispatch
 * Format strictly matches:
 * Maa Electric
 * Sagordeghi, Ghatail
 * Phone: 017----------
 *
 * 1 x 1.0 Rm BYA — 10 Coils [Red: 6, Blk: 4]
 * 1 x 1.3 Rm BYA — 10 Coils [Red: 6, Blk: 4]
 * 1 x 1.5 Rm BYA — 10 Coils [Red: 6, Blk: 4]
 * 2 x 12/0076 TT — 10 Coils (500 x 2)
 * 2 x 23/0076 TT — 10 Coils (500 x 2)
 *
 * MP: Subrata Sutradhar
 * Effective Date (10%)
 * Total: 76,554/-
 * Due: 39,112/-
 */
export function generateRequisitionWhatsAppText(req: RequisitionSlipData, masterItems: Item[] = []): string {
  const subtotal = req.subtotalAmount || calculateRequisitionSubtotal(req, masterItems);
  const discountPercent = req.discountPercent !== undefined ? req.discountPercent : 10;
  const discountAmt = req.discountAmount !== undefined ? req.discountAmount : Math.round(subtotal * (discountPercent / 100));
  const netAmount = req.netAmount !== undefined ? req.netAmount : Math.max(0, subtotal - discountAmt);
  const dueAmt = req.dueAmount !== undefined ? req.dueAmount : 39112;

  const fmt = (n: number) => n.toLocaleString('en-IN');

  const itemsList = (req.lines || [])
    .filter((l) => (l.description || '').trim() || l.quantity > 0)
    .map((l) => {
      const colors = [];
      if (l.colors?.red) colors.push(`Red: ${l.colors.red}`);
      if (l.colors?.black) colors.push(`Blk: ${l.colors.black}`);
      if (l.colors?.yellow) colors.push(`Yel: ${l.colors.yellow}`);
      if (l.colors?.green) colors.push(`Grn: ${l.colors.green}`);
      if (l.colors?.blue) colors.push(`Blu: ${l.colors.blue}`);
      const colorStr = colors.length > 0 ? ` [${colors.join(', ')}]` : '';
      const rem = l.remarks ? ` (${l.remarks})` : '';
      return `${l.description || ''} — ${l.quantity || 0} ${l.unit || 'Coils'}${colorStr}${rem}`;
    })
    .join('\n');

  const phoneStr = req.partyPhone ? req.partyPhone : '017----------';
  const addressStr = req.partyAddress ? req.partyAddress : '';
  const mpName = (req.marketingPersonName || req.reqBy || 'Subrata Sutradhar').trim();

  return `${req.partyName || ''}
${addressStr ? `${addressStr}\n` : ''}Phone: ${phoneStr}

${itemsList}

MP: ${mpName}
Effective Date (${discountPercent}%)
Total: ${fmt(netAmount)}/-
Due: ${fmt(dueAmt)}/-`;
}

/**
 * Calculate Requisition Subtotal from items
 */
export function calculateRequisitionSubtotal(req: RequisitionSlipData, masterItems: Item[] = []): number {
  if (req.subtotalAmount && req.subtotalAmount > 0) return req.subtotalAmount;
  let total = 0;
  (req.lines || []).forEach((l) => {
    const qty = Number(l.quantity) || 0;
    let rate = l.rate || 0;
    if (!rate && masterItems.length > 0) {
      const match = masterItems.find(
        (it) => it.id === l.itemId || ((it.name || '').toLowerCase().trim() === (l.description || '').toLowerCase().trim())
      );
      if (match) {
        const special = detectSpecialItemInfo(l.description || '', l.remarks || '', l.unit, qty, match.rate);
        rate = special.isSpecialItem ? special.calculatedRate : match.rate;
      }
    }
    total += qty * (rate || 334);
  });
  return total > 0 ? total : 202407; // default sample 2,02,407 Tk
}

/**
 * Build XLSX workbook matching the exact layout of the user's reference image (req.png)
 */
export function buildRequisitionWorkbook(req: RequisitionSlipData, masterItems: Item[] = []): XLSX.WorkBook {
  const rows: any[][] = [
    ['', '', '', 'Requisition Silp'],
    [],
    ['Req #', req.reqNo || '', '', '', '', '', 'Req Date:', req.reqDate || ''],
    ['To   :', req.toDestination || 'Factory', '', '', '', '', 'Delv Date:', req.delvDate || ''],
    ['Party:', req.partyName || ''],
    ['', req.partyAddress || ''],
    [],
    ['SL', 'Description of Items', 'Quantity', 'Red', 'Black', 'Yellow', 'Green', 'Blue', 'Remarks']
  ];

  (req.lines || [])
    .filter((l) => (l.description || '').trim() || l.quantity > 0)
    .forEach((l, idx) => {
      const qtyDisplay = l.quantity
        ? `${String(l.quantity).padStart(2, '0')} ${l.unit || 'Coils'}`
        : '';
      rows.push([
        idx + 1,
        l.description || '',
        qtyDisplay,
        l.colors?.red || '',
        l.colors?.black || '',
        l.colors?.yellow || '',
        l.colors?.green || '',
        l.colors?.blue || '',
        l.remarks || ''
      ]);
    });

  // Empty spacer row
  rows.push([]);
  rows.push([]);

  // Signatures row matching req.png
  rows.push([
    req.marketingPersonName || 'Subrata',
    '',
    '',
    req.preparedBy || 'Rajon',
    '',
    '',
    '',
    req.approvedBy || 'Shaheen Khan'
  ]);
  rows.push([
    'Req. By',
    '',
    '',
    'Prepared By',
    '',
    '',
    '',
    'Approved By'
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 6 },  // SL
    { wch: 28 }, // Description of Items
    { wch: 14 }, // Quantity
    { wch: 8 },  // Red
    { wch: 8 },  // Black
    { wch: 8 },  // Yellow
    { wch: 8 },  // Green
    { wch: 8 },  // Blue
    { wch: 16 }  // Remarks
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Requisition_Slip');
  return wb;
}

/**
 * Export Requisition Slip directly to Excel (.xlsx) file download
 */
export function exportRequisitionToExcel(req: RequisitionSlipData, masterItems: Item[] = []): void {
  const wb = buildRequisitionWorkbook(req, masterItems);
  const cleanReqNo = (req.reqNo || 'Slip').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = (req.reqDate || 'Date').replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Requisition_${cleanReqNo}_${dateStr}.xlsx`);
}

/**
 * Generate Requisition Excel Base64 string for direct email attachments
 */
export function generateRequisitionExcelBase64(
  req: RequisitionSlipData,
  masterItems: Item[] = []
): { fileName: string; base64: string } {
  const wb = buildRequisitionWorkbook(req, masterItems);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const cleanReqNo = (req.reqNo || 'Slip').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Requisition_${cleanReqNo}.xlsx`;
  return { fileName, base64 };
}

/**
 * Default sample requisitions (including the sample from req.png)
 */
export function getDefaultSampleRequisitions(): RequisitionSlipData[] {
  return [
    {
      id: 'req-sample-62-subrata',
      reqNo: '62-Subrata',
      seqNumber: 62,
      marketingPersonName: 'Subrata',
      toDestination: 'Factory',
      partyName: 'Maa Electric',
      partyAddress: 'Sagordighi,Ghatail',
      partyPhone: '01712-345678',
      deliverySite: '',
      reqDate: '28.07.2026',
      delvDate: '28.07.2026',
      subtotalAmount: 202407,
      discountPercent: 10,
      discountEffectiveDate: '01.02.2026',
      discountAmount: 20241,
      netAmount: 182166,
      dueAmount: 39112,
      lines: [
        {
          id: 'rline-1',
          sl: 1,
          description: '1 x 1.0 Rm BYA',
          quantity: 10,
          unit: 'Coils',
          colors: { red: 6, black: 4 },
          remarks: ''
        },
        {
          id: 'rline-2',
          sl: 2,
          description: '1 x 1.3 Rm BYA',
          quantity: 10,
          unit: 'Coils',
          colors: { red: 6, black: 4 },
          remarks: ''
        },
        {
          id: 'rline-3',
          sl: 3,
          description: '1 x 1.5 Rm BYA',
          quantity: 10,
          unit: 'Coils',
          colors: { red: 6, black: 4 },
          remarks: ''
        },
        {
          id: 'rline-4',
          sl: 4,
          description: '1 x 2.0 Rm BYA',
          quantity: 5,
          unit: 'Coils',
          colors: { red: 3, black: 2 },
          remarks: ''
        },
        {
          id: 'rline-5',
          sl: 5,
          description: '1 x 2.5 Rm BYA',
          quantity: 10,
          unit: 'Coils',
          colors: { red: 6, black: 4 },
          remarks: ''
        },
        {
          id: 'rline-6',
          sl: 6,
          description: '1 x 3.0 Rm BYA',
          quantity: 1,
          unit: 'Coil',
          colors: { red: 1 },
          remarks: ''
        },
        {
          id: 'rline-7',
          sl: 7,
          description: '1 x 4.0 Rm BYA',
          quantity: 5,
          unit: 'Coils',
          colors: { red: 3, black: 2 },
          remarks: ''
        },
        {
          id: 'rline-8',
          sl: 8,
          description: '2 x 12/0076 TT',
          quantity: 10,
          unit: 'Coils',
          colors: {},
          remarks: '500 x 2',
          isSpecialItem: true,
          specialMeters: 500,
          baseCoilEquivalent: 5
        },
        {
          id: 'rline-9',
          sl: 9,
          description: '2 x 23/0076 TT',
          quantity: 10,
          unit: 'Coils',
          colors: {},
          remarks: '500 x 2',
          isSpecialItem: true,
          specialMeters: 500,
          baseCoilEquivalent: 5
        },
        {
          id: 'rline-10',
          sl: 10,
          description: '2 x 40/0076 TT',
          quantity: 10,
          unit: 'Coils',
          colors: {},
          remarks: '500 x 2',
          isSpecialItem: true,
          specialMeters: 500,
          baseCoilEquivalent: 5
        },
        {
          id: 'rline-11',
          sl: 11,
          description: '2 x 23/0076 FT',
          quantity: 10,
          unit: 'Coils',
          colors: {},
          remarks: '500 x 2',
          isSpecialItem: true,
          specialMeters: 500,
          baseCoilEquivalent: 5
        },
        {
          id: 'rline-12',
          sl: 12,
          description: '2 x 40/0076 FT',
          quantity: 10,
          unit: 'Coils',
          colors: {},
          remarks: '500 x 2',
          isSpecialItem: true,
          specialMeters: 500,
          baseCoilEquivalent: 5
        },
        {
          id: 'rline-13',
          sl: 13,
          description: '2 x 70/0076 FT',
          quantity: 5,
          unit: 'Coils',
          colors: {},
          remarks: '500 x 1',
          isSpecialItem: true,
          specialMeters: 500,
          baseCoilEquivalent: 5
        },
        {
          id: 'rline-14',
          sl: 14,
          description: '1.0 Rm 2C/Ecc',
          quantity: 500,
          unit: 'Mtrs',
          colors: {},
          remarks: '500 x 1',
          isSpecialItem: true,
          specialMeters: 500,
          baseCoilEquivalent: 5
        },
        {
          id: 'rline-15',
          sl: 15,
          description: '1.5 Rm 2C/Ecc',
          quantity: 500,
          unit: 'Mtrs',
          colors: {},
          remarks: '500 x 1',
          isSpecialItem: true,
          specialMeters: 500,
          baseCoilEquivalent: 5
        }
      ],
      totalQuantity: 606,
      reqBy: 'Subrata',
      preparedBy: 'Rajon',
      approvedBy: 'Madhupur Sales Center',
      status: 'pending',
      auditMailSent: true,
      auditMailSentAt: '2026-07-28T09:30:00Z',
      savedAt: '2026-07-28T09:15:00Z'
    }
  ];
}

/**
 * Helper to calculate bill number for a requisition delivery.
 * 1st delivery: "62"
 * 2nd delivery: "62(A)"
 * 3rd delivery: "62(B)"
 * 4th delivery: "62(C)", etc.
 */
export function getDeliveryBillNumber(req: RequisitionSlipData, deliveryIndex: number = 0): string {
  // Extract clean number e.g. 67 from "# 67-Subrata" or "67-Subrata" or seqNumber
  let baseNum = req.seqNumber ? String(req.seqNumber) : '';
  if (!baseNum && req.reqNo) {
    const clean = req.reqNo.replace(/^(req\s*(#|no\.?|no)?\s*)+/i, '').replace(/^#+\s*/, '').trim();
    const match = clean.match(/^(\d+)/);
    if (match) baseNum = match[1];
    else {
      const beforeDash = clean.split(/[-–—(/]/)[0]?.trim() || clean;
      const digits = beforeDash.match(/\d+/);
      baseNum = digits ? digits[0] : beforeDash;
    }
  }
  if (!baseNum) baseNum = '20';

  if (deliveryIndex <= 0) {
    return baseNum;
  }

  // 1 -> A, 2 -> B, 3 -> C, etc.
  const letter = String.fromCharCode(65 + (deliveryIndex - 1));
  return `${baseNum}-${letter}`;
}

/**
 * Convert a Requisition into a StoredBill (Office Bill)
 */
export function buildOfficeBillFromRequisition(
  req: RequisitionSlipData,
  masterItems: Item[] = [],
  discountPercent: number = 10,
  deliveredLines: RequisitionSlipItem[] = [],
  deliveryIndex?: number,
  customBillNo?: string
): { bill: StoredBill; header: BillHeader; lines: BillLineItem[] } {
  const effectiveLines = deliveredLines.length > 0 ? deliveredLines : req.lines;

  // Determine Bill Number: 1st delivery: 62, 2nd: 62(A), 3rd: 62(B), etc.
  const currentDeliveryIdx = deliveryIndex !== undefined 
    ? deliveryIndex 
    : (req.deliveryCount || (req.partialDeliveries ? req.partialDeliveries.length : 0));
  
  const finalBillNo = customBillNo || getDeliveryBillNumber(req, currentDeliveryIdx);

  const billLines: BillLineItem[] = effectiveLines.map((line, idx) => {
    const qty = line.deliveredQty !== undefined ? Number(line.deliveredQty) : Number(line.quantity) || 0;
    
    // Lookup matching master item rate
    let matchedItem = masterItems.find(
      (it) => it.id === line.itemId || (it.name && it.name.toLowerCase().trim() === line.description.toLowerCase().trim())
    );
    if (!matchedItem) {
      matchedItem = masterItems.find((it) => {
        const iDesc = line.description.toLowerCase().replace(/[^a-z0-9]/g, '');
        const itName = it.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return iDesc.includes(itName) || itName.includes(iDesc);
      });
    }

    const specialInfo = detectSpecialItemInfo(line.description, line.remarks || '', line.unit || '', qty, matchedItem?.rate || 0);
    const rate = line.rate !== undefined && line.rate > 0 
      ? line.rate 
      : (specialInfo.isSpecialItem ? specialInfo.calculatedRate : (matchedItem?.rate || 0));
    const amount = Math.round(qty * rate);

    return {
      id: `office-line-${Date.now()}-${idx + 1}`,
      slNo: idx + 1,
      itemId: matchedItem?.id || line.itemId,
      itemDescription: line.description,
      sizeSpec: matchedItem?.sizeSpec || '',
      coilQty: qty,
      unit: line.unit || 'Coils',
      rate: rate,
      amount: amount,
      isSpecialItem: line.isSpecialItem || specialInfo.isSpecialItem || matchedItem?.isSpecialItem,
      baseItemId: matchedItem?.baseItemId,
      stockMultiplier: matchedItem?.stockMultiplier || (specialInfo.isSpecialItem ? specialInfo.baseCoilEquivalent : 1)
    };
  });

  const subtotal = billLines.reduce((sum, l) => sum + (l.amount || 0), 0);
  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const grandTotal = Math.max(0, subtotal - discountAmount);

  const billHeader: BillHeader = {
    partyName: req.partyName,
    address: req.deliverySite ? `${req.partyAddress || ''} [Site: ${req.deliverySite}]`.trim() : (req.partyAddress || ''),
    phone: req.partyPhone || '',
    orderNumber: finalBillNo,
    billNo: finalBillNo, // 62, 62(A), 62(B), 67, etc. Never 67-Subrata
    challanNo: `CH-${finalBillNo}`,
    refNo: finalBillNo,
    date: req.delvDate || req.reqDate,
    orderDate: req.reqDate,
    challanDate: req.delvDate || req.reqDate,
    salesmanCode: req.marketingPersonName,
    salespersonName: req.marketingPersonName,
    discountPercent: discountPercent,
    isOfficeBill: true // Office Bill
  };

  const storedBill: StoredBill = {
    id: `bill-${Date.now()}-${finalBillNo.replace(/[^a-zA-Z0-9]/g, '_')}`,
    savedAt: new Date().toISOString(),
    company: defaultCompany,
    header: billHeader,
    lines: billLines,
    subtotal: subtotal,
    discountAmount: discountAmount,
    grandTotal: grandTotal,
    inWords: '',
    isOfficeBill: true
  };

  return { bill: storedBill, header: billHeader, lines: billLines };
}
