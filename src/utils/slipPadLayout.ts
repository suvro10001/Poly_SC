export const DPI = 96;
export const PAD_WIDTH_INCH = 5.5;
export const PAD_HEIGHT_INCH = 8.5;
export const PAD_WIDTH_PX = Math.round(PAD_WIDTH_INCH * DPI); // 528
export const PAD_HEIGHT_PX = Math.round(PAD_HEIGHT_INCH * DPI); // 816

export interface ElementPosition {
  left: number; // in inches
  top: number; // in inches
  width: number; // in inches
  fontSize: number; // in px
}

export interface ColumnLayout {
  left: number; // in inches
  width: number; // in inches
}

export interface SlipPadLayoutConfig {
  date: ElementPosition;
  partyName: ElementPosition;
  phone: ElementPosition;
  address: ElementPosition;
  columns: {
    sl: ColumnLayout;
    description: ColumnLayout;
    qty: ColumnLayout;
    rate: ColumnLayout;
    amount: ColumnLayout;
  };
  table: {
    startY: number; // in inches
    startX: number; // in inches (horizontal shift)
    rowHeight: number; // in inches
    fontSize: number; // in px
  };
  totals: ElementPosition;
  rowYOffsets: number[];
  inWordsLine1: ElementPosition;
  inWordsLine2: ElementPosition;
}

export const DEFAULT_SLIP_PAD_LAYOUT: SlipPadLayoutConfig = {
  date: {
    left: 4.15,
    top: 1.15,
    width: 1.2,
    fontSize: 12
  },
  partyName: {
    left: 0.65,
    top: 1.40,
    width: 3.2,
    fontSize: 13
  },
  phone: {
    left: 4.15,
    top: 1.40,
    width: 1.2,
    fontSize: 11
  },
  address: {
    left: 0.65,
    top: 1.66,
    width: 4.65,
    fontSize: 12
  },
  columns: {
    sl: { left: 0.18, width: 0.44 },
    description: { left: 0.62, width: 2.75 },
    qty: { left: 3.37, width: 0.46 },
    rate: { left: 3.83, width: 0.60 },
    amount: { left: 4.43, width: 0.89 }
  },
  table: {
    startY: 2.18,
    startX: 0,
    rowHeight: 0.255,
    fontSize: 12
  },
  totals: {
    left: 3.37,
    top: 5.75,
    width: 1.95,
    fontSize: 12
  },
  rowYOffsets: Array(15).fill(0),
  inWordsLine1: {
    left: 0.68,
    top: 6.25,
    width: 4.60,
    fontSize: 11
  },
  inWordsLine2: {
    left: 0.68,
    top: 6.50,
    width: 4.60,
    fontSize: 11
  }
};

const STORAGE_KEY = 'polycables_slip_pad_layout_v3';

export function loadSavedSlipPadLayout(): SlipPadLayoutConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('polycables_slip_pad_layout_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_SLIP_PAD_LAYOUT,
        ...parsed,
        columns: {
          ...DEFAULT_SLIP_PAD_LAYOUT.columns,
          ...(parsed.columns || {})
        },
        table: {
          ...DEFAULT_SLIP_PAD_LAYOUT.table,
          ...(parsed.table || {})
        },
        totals: {
          ...DEFAULT_SLIP_PAD_LAYOUT.totals,
          ...(parsed.totals || {})
        },
        rowYOffsets: Array.isArray(parsed.rowYOffsets) ? parsed.rowYOffsets : DEFAULT_SLIP_PAD_LAYOUT.rowYOffsets
      };
    }
  } catch (err) {
    console.error('Error loading slip pad layout:', err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_SLIP_PAD_LAYOUT));
}

export function saveSlipPadLayout(layout: SlipPadLayoutConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch (err) {
    console.error('Error saving slip pad layout:', err);
  }
}

export function resetSlipPadLayout(): SlipPadLayoutConfig {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('polycables_slip_pad_layout_v2');
  } catch (err) {}
  return JSON.parse(JSON.stringify(DEFAULT_SLIP_PAD_LAYOUT));
}

