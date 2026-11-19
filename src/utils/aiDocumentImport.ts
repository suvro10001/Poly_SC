import { readFileAsDataUrl, compressImageIfNeeded } from './fileUploadHelper';
import { fastParseExcelChallan } from './challanFileParser';

export interface ParsedDocumentResult {
  partyName?: string;
  address?: string;
  phone?: string;
  date?: string;
  orderDate?: string;
  challanDate?: string;
  billNo?: string;
  challanNo?: string;
  orderNumber?: string;
  reqNo?: string;
  refNo?: string;
  salesmanCode?: string;
  salespersonName?: string;
  totalCoils?: number;
  carNumber?: string;
  vehicleNo?: string;
  driverName?: string;
  driverPhone?: string;
  discountPercent?: number;
  discountAmount?: number;
  remarks?: string;
  lines: Array<{
    slNo?: number;
    itemId?: string;
    itemCode?: string;
    itemDescription: string;
    itemName?: string;
    sizeSpec?: string;
    category?: string;
    quantity?: number;
    coilQty?: number;
    qty?: number;
    unit?: string;
    rate?: number;
    amount?: number;
    red?: number;
    black?: number;
    yellow?: number;
    green?: number;
    blue?: number;
    others?: number;
    missingQty?: boolean;
  }>;
}

export async function parseDocumentWithAI(
  file: File,
  options: {
    mode: 'bill' | 'factory';
    knownParties?: any[];
    knownItems?: any[];
  }
): Promise<{ data: ParsedDocumentResult | null; method: string; error?: string; needsApiKey?: boolean }> {
  const fileNameLower = (file.name || '').toLowerCase();
  const isExcel =
    fileNameLower.endsWith('.xlsx') ||
    fileNameLower.endsWith('.xls') ||
    fileNameLower.endsWith('.csv') ||
    file.type.includes('spreadsheet') ||
    file.type.includes('excel') ||
    file.type.includes('csv');
  const isPdf = fileNameLower.endsWith('.pdf') || file.type === 'application/pdf';
  const isImage =
    file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|heic|tiff?)$/i.test(fileNameLower);

  if (!isExcel && !isPdf && !isImage) {
    return {
      data: null,
      method: 'unsupported',
      error: 'Unsupported file format. Please upload Excel (.xlsx, .xls, .csv), PDF (.pdf), or Image (.jpeg, .jpg, .png).'
    };
  }

  let base64Data = '';
  let mimeType = file.type || '';

  if (isExcel) {
    const rawDataUrl = await readFileAsDataUrl(file);
    base64Data = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
    if (fileNameLower.endsWith('.csv')) {
      mimeType = 'text/csv';
    } else if (fileNameLower.endsWith('.xls')) {
      mimeType = 'application/vnd.ms-excel';
    } else {
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
  } else if (isPdf) {
    const rawDataUrl = await readFileAsDataUrl(file);
    base64Data = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
    mimeType = 'application/pdf';
  } else {
    const rawDataUrl = await readFileAsDataUrl(file);
    const compressedDataUrl = await compressImageIfNeeded(rawDataUrl, 1500, 1500, 0.85);
    base64Data = compressedDataUrl.includes(',') ? compressedDataUrl.split(',')[1] : compressedDataUrl;
    if (compressedDataUrl.startsWith('data:image/png')) {
      mimeType = 'image/png';
    } else if (compressedDataUrl.startsWith('data:image/webp')) {
      mimeType = 'image/webp';
    } else {
      mimeType = 'image/jpeg';
    }
  }

  // Run fast local Excel extraction in parallel only as safety backup
  let localExcelBackup: ParsedDocumentResult | null = null;
  if (isExcel) {
    try {
      const fastData = await fastParseExcelChallan(file, {
        knownParties: options.knownParties || [],
        knownItems: options.knownItems || []
      });
      if (fastData && Array.isArray(fastData.lines) && fastData.lines.length > 0) {
        localExcelBackup = {
          ...fastData.header,
          lines: fastData.lines
        };
      }
    } catch {}
  }

  // Send compact catalog summary so payload stays fast even with 500+ items
  const compactItems = (options.knownItems || []).slice(0, 350).map((it: any) => ({
    id: it?.id || '',
    code: it?.code || '',
    name: it?.name || it?.itemDescription || '',
    sizeSpec: it?.sizeSpec || '',
    unit: it?.unit || 'Coils',
    rate: Number(it?.rate) || 0
  }));

  const compactParties = (options.knownParties || []).slice(0, 180).map((p: any) => ({
    name: typeof p === 'string' ? p : p?.name || '',
    address: p?.address || '',
    phone: p?.phone || '',
    salesmanCode: p?.salesmanCode || ''
  }));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch('/api/parse-bill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        fileData: base64Data,
        mimeType,
        fileName: file.name,
        mode: options.mode,
        forceAi: true,
        knownParties: compactParties,
        knownItems: compactItems
      })
    });
    clearTimeout(timeoutId);

    const resData = await response.json();
    if (resData?.success && resData?.data && Array.isArray(resData.data.lines) && resData.data.lines.length > 0) {
      return {
        data: resData.data,
        method: resData.method || 'gemini_ai'
      };
    }

    if (localExcelBackup && localExcelBackup.lines.length > 0) {
      return {
        data: localExcelBackup,
        method: 'local_excel_fallback'
      };
    }

    return {
      data: null,
      method: 'failed',
      needsApiKey: Boolean(resData?.needsApiKey),
      error: resData?.error || 'Could not detect clear line items in this document.'
    };
  } catch (err: any) {
    if (localExcelBackup && localExcelBackup.lines.length > 0) {
      return {
        data: localExcelBackup,
        method: 'local_excel_fallback'
      };
    }
    return {
      data: null,
      method: 'failed',
      error: err?.message || 'Network error while parsing document with AI.'
    };
  }
}
