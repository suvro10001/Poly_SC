/**
 * Printer Auto-Configuration & Diagnostic Engine
 * Automatically detects document type, injects exact @page dimensions,
 * removes browser margin offset, enforces high-fidelity color printing,
 * and eliminates page break/spillover issues for Bill Invoices and Slip Pads.
 */


import { exportHtmlStringToStyledExcel } from './excelPrintHelper';

export interface PrinterConfigOptions {
  orientation?: 'portrait' | 'landscape';
  paperPreset?: 'auto' | 'pad_5.5x8.5' | 'bill_7.2x10' | 'a4' | 'letter';
  marginsMm?: number; // 0 for exact edge-to-edge pre-printed pads
  offsetXmm?: number; // horizontal alignment offset in mm
  offsetYmm?: number; // vertical alignment offset in mm
  scale?: number; // 1.0 for 100%
  exactColors?: boolean;
}

export const PAPER_PRESETS = {
  'pad_5.5x8.5': {
    name: 'Slip Pad (5.5" × 8.5" / Half-Letter)',
    width: '5.5in',
    height: '8.5in',
    orientation: 'portrait',
    description: 'Exact physical pre-printed half-letter memo pad'
  },
  'bill_7.2x10': {
    name: 'Standard Bill Pad (7.2" × 10" / 183mm × 254mm)',
    width: '7.2in',
    height: '10in',
    orientation: 'portrait',
    description: 'Exact physical Poly Cables bill stationery dimensions'
  },
  'a4': {
    name: 'A4 Standard (210mm × 297mm)',
    width: '210mm',
    height: '297mm',
    orientation: 'portrait',
    description: 'Standard office laser & inkjet printer paper'
  },
  'letter': {
    name: 'US Letter (8.5" × 11")',
    width: '8.5in',
    height: '11in',
    orientation: 'portrait',
    description: 'Standard US Letter printer paper'
  }
} as const;

export function getSavedPrinterConfig(documentType: string): PrinterConfigOptions {
  try {
    const raw = localStorage.getItem(`polycables_printer_config_${documentType}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load saved printer configuration', err);
  }

  // Defaults
  if (documentType === 'slip_pad') {
    return {
      orientation: 'portrait',
      paperPreset: 'pad_5.5x8.5',
      marginsMm: 0,
      offsetXmm: 0,
      offsetYmm: 0,
      scale: 1.0,
      exactColors: true
    };
  } else if (documentType === 'bill' || documentType === 'challan') {
    return {
      orientation: 'portrait',
      paperPreset: 'bill_7.2x10',
      marginsMm: 0,
      offsetXmm: 0,
      offsetYmm: 0,
      scale: 1.0,
      exactColors: true
    };
  }

  return {
    orientation: 'portrait',
    paperPreset: 'a4',
    marginsMm: 0,
    offsetXmm: 0,
    offsetYmm: 0,
    scale: 1.0,
    exactColors: true
  };
}

export function savePrinterConfig(documentType: string, options: PrinterConfigOptions): void {
  try {
    localStorage.setItem(`polycables_printer_config_${documentType}`, JSON.stringify(options));
  } catch (err) {
    console.warn('Failed to persist printer configuration', err);
  }
}

/**
 * Injects dynamic print styles tailored for the exact document and paper format
 */
export function autoConfigurePrintStyles(
  documentType: 'bill' | 'slip_pad' | 'challan' | 'statement' | 'report' = 'bill',
  options: PrinterConfigOptions = {}
): () => void {
  const saved = getSavedPrinterConfig(documentType);
  const mergedOptions: PrinterConfigOptions = { ...saved, ...options };

  const {
    orientation = documentType === 'slip_pad' ? 'portrait' : 'portrait',
    paperPreset = documentType === 'slip_pad' ? 'pad_5.5x8.5' : (documentType === 'bill' || documentType === 'challan' ? 'bill_7.2x10' : 'a4'),
    marginsMm = 0,
    offsetXmm = 0,
    offsetYmm = 0,
    scale = 1.0,
    exactColors = true
  } = mergedOptions;

  const styleId = 'auto-configured-printer-style';
  let existingStyle = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!existingStyle) {
    existingStyle = document.createElement('style');
    existingStyle.id = styleId;
    document.head.appendChild(existingStyle);
  }

  // Determine size string
  let sizeCss = 'auto';
  if (paperPreset === 'pad_5.5x8.5') {
    sizeCss = '5.5in 8.5in';
  } else if (paperPreset === 'bill_7.2x10') {
    sizeCss = '7.2in 10in';
  } else if (paperPreset === 'a4') {
    sizeCss = '210mm 297mm';
  } else if (paperPreset === 'letter') {
    sizeCss = '8.5in 11in';
  } else {
    sizeCss = orientation === 'landscape' ? 'landscape' : 'portrait';
  }

  const transformCss = `translate(${offsetXmm}mm, ${offsetYmm}mm) scale(${scale})`;

  const effectiveMarginsMm = documentType === 'slip_pad' ? 0 : marginsMm;

  existingStyle.textContent = `
    @page {
      size: ${sizeCss};
      margin: ${effectiveMarginsMm}mm !important;
      -webkit-print-color-adjust: ${exactColors ? 'exact' : 'auto'} !important;
      print-color-adjust: ${exactColors ? 'exact' : 'auto'} !important;
    }

    @media print {
      *, *::before, *::after {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      html, body {
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        overflow: visible !important;
      }

      aside,
      nav,
      header:not(.printable-header) {
        display: none !important;
      }

      #root,
      main,
      .min-h-screen {
        width: 100% !important;
        max-width: 100% !important;
        min-height: 0 !important;
        height: auto !important;
        margin: 0 auto !important;
        padding: 0 !important;
      }

      body:has(.print-preview-modal-backdrop) main *:not(.print-preview-modal-backdrop):not(.print-preview-modal-backdrop *):not(:has(.print-preview-modal-backdrop)) {
        display: none !important;
      }

      .print-preview-modal-backdrop,
      .print-preview-modal-dialog,
      .print-preview-canvas-container {
        display: block !important;
        position: static !important;
        inset: auto !important;
        width: 100% !important;
        max-width: 100% !important;
        max-height: none !important;
        height: auto !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: transparent !important;
        backdrop-filter: none !important;
        border: none !important;
        box-shadow: none !important;
        overflow: visible !important;
      }

      .print-page-break {
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .no-print, .watermark {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }

      /* Slip Pad Printing Styles: Exactly 5.5" x 8.5" with zero margin offset */
      .printable-slip-pad,
      .slip-pad-page {
        display: block !important;
        visibility: visible !important;
        width: 5.5in !important;
        height: 8.5in !important;
        max-width: 5.5in !important;
        max-height: 8.5in !important;
        min-width: 5.5in !important;
        min-height: 8.5in !important;
        margin: 0 auto !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        margin-left: auto !important;
        margin-right: auto !important;
        position: relative !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        box-shadow: none !important;
        border: none !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
        overflow: hidden !important;
        background: #ffffff !important;
      }

      .printable-slip-pad [class*="text-white"],
      .printable-slip-pad .text-white,
      .bg-\\[\\#142058\\] [class*="text-white"],
      .bg-\\[\\#142058\\] span,
      .bg-\\[\\#142058\\] div,
      .bg-\\[\\#142058\\] h1,
      .bg-\\[\\#142058\\] p {
        color: #ffffff !important;
      }

      .bill-paper-dimensions,
      .print-paper-sheet,
      .challan-print-sheet,
      .expense-print-sheet {
        display: block !important;
        visibility: visible !important;
        width: ${paperPreset === 'a4' ? '100%' : '7.2in'} !important;
        max-width: ${paperPreset === 'a4' ? '100%' : '7.2in'} !important;
        min-height: ${paperPreset === 'a4' ? 'auto' : '10in'} !important;
        max-height: none !important;
        height: auto !important;
        margin: 0 auto !important;
        position: relative !important;
        top: 0 !important;
        left: auto !important;
        right: auto !important;
        padding: ${paperPreset === 'a4' ? '0.28in' : '0 0.28in 0.28in 0.28in'} !important;
        transform: ${offsetXmm !== 0 || offsetYmm !== 0 || scale !== 1 ? transformCss : 'none'} !important;
        box-shadow: none !important;
        border: none !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
        overflow: visible !important;
      }

      .expense-statement-sheet {
        display: block !important;
        visibility: visible !important;
        width: 100% !important;
        max-width: 100% !important;
        min-height: auto !important;
        max-height: none !important;
        margin: 0 auto !important;
        padding: 0 !important;
        position: relative !important;
        box-shadow: none !important;
        border: none !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
        overflow: visible !important;
        background: #ffffff !important;
      }

      /* Standardized Excel Grid Print Styling (excluding custom pre-printed Slip Pad overlay) */
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

  // Return a cleanup function
  return () => {
    const el = document.getElementById(styleId);
    if (el) {
      el.remove();
    }
  };
}

/**
 * Triggers the browser print dialog with auto-configured paper and printer settings
 */
export function triggerAutoConfiguredPrint(
  documentType: 'bill' | 'slip_pad' | 'challan' | 'statement' | 'report' = 'bill',
  options: PrinterConfigOptions = {}
): void {
  const cleanup = autoConfigurePrintStyles(documentType, options);
  const originalTitle = document.title;
  try {
    (window as any).__polycablesLastDocTitle = originalTitle;
  } catch {}

  // Set document.title to empty so browser headers don't print "My Google AI Studio App" or timestamps
  try {
    document.title = '';
  } catch (err) {
    // Ignore title write error if restricted
  }

  const restoreTitle = () => {
    try {
      document.title = originalTitle;
    } catch (err) {
      // Ignore
    }
    window.removeEventListener('afterprint', restoreTitle);
  };
  window.addEventListener('afterprint', restoreTitle);

  // Allow browser DOM to paint injected @page styles before opening print dialog
  setTimeout(() => {
    try {
      window.print();
    } finally {
      // Auto-cleanup after print dialog completes/closes
      setTimeout(() => {
        restoreTitle();
        cleanup();
      }, 2500);
    }
  }, 100);
}

/**
 * Clean isolated iframe printing utility.
 * Exports matching Excel file and injects only the requested HTML document into an isolated hidden iframe
 * and invokes its print dialog, ensuring zero bleeding or clutter from the main page.
 */
export function printHtmlViaIframe(title: string, bodyHtml: string): void {
  void exportHtmlStringToStyledExcel(title, bodyHtml).catch(() => {});

  const existing = document.getElementById('polycables-print-iframe');
  if (existing) {
    existing.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'polycables-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 10mm 10mm;
          }
          *, *::before, *::after {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: Calibri, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            margin: 0;
            padding: 0;
            color: #000000;
            background: #ffffff;
            font-size: 11px;
            line-height: 1.35;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #000000;
            padding: 4px 6px;
          }
          th {
            background-color: #E8EEF5;
            color: #000000;
            font-weight: 800;
            text-transform: uppercase;
            font-size: 10px;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-left { text-align: left; }
          .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
          .font-bold { font-weight: bold; }
          .font-black { font-weight: 900; }
          .uppercase { text-transform: uppercase; }
          .border-b { border-bottom: 1px solid #000; }
          .border-t { border-top: 1px solid #000; }
        </style>
      </head>
      <body>
        ${bodyHtml}
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Iframe print error:', e);
    } finally {
      setTimeout(() => {
        try {
          iframe.remove();
        } catch (e) {}
      }, 3000);
    }
  }, 250);
}

