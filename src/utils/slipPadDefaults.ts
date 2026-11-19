export interface SlipPadConfig {
  topMarginInch: number;
  leftMarginInch: number;
  metaSectionPx: number;
  tableSectionPx: number;
  footerPx: number;
  dateShiftX: number;
  dateShiftY: number;
  partyNameShiftX: number;
  partyNameShiftY: number;
  phoneShiftX: number;
  phoneShiftY: number;
  addressShiftX: number;
  addressShiftY: number;
  colSlShiftX: number;
  colSlShiftY: number;
  colDescShiftX: number;
  colDescShiftY: number;
  colQtyShiftX: number;
  colQtyShiftY: number;
  colRateShiftX: number;
  colRateShiftY: number;
  colAmountShiftX: number;
  colAmountShiftY: number;
  totalBoxShiftX: number;
  totalBoxShiftY: number;
  inWordsShiftX: number;
  inWordsShiftY: number;
  fontScale: number;
  rowHeight: number;
  colWidthSl: number;
  colWidthQty: number;
  colWidthRate: number;
  colWidthAmount: number;
  partyNameFontSize: number;
  dateFontSize: number;
  phoneFontSize: number;
  addressFontSize: number;
  tableHeaderFontSize: number;
  itemRowsFontSize: number;
  totalRowFontSize: number;
  inWordsFontSize: number;
}

export const DEFAULT_SLIP_PAD_CONFIG: SlipPadConfig = {
  topMarginInch: 0.5,
  leftMarginInch: 0,
  metaSectionPx: 0,
  tableSectionPx: -170,
  footerPx: 180,
  dateShiftX: 30,
  dateShiftY: -120,
  partyNameShiftX: 56,
  partyNameShiftY: -120,
  phoneShiftX: 30,
  phoneShiftY: -120,
  addressShiftX: 56,
  addressShiftY: -120,
  colSlShiftX: 0,
  colSlShiftY: 0,
  colDescShiftX: 0,
  colDescShiftY: 0,
  colQtyShiftX: -18,
  colQtyShiftY: 0,
  colRateShiftX: -14,
  colRateShiftY: 0,
  colAmountShiftX: -8,
  colAmountShiftY: 0,
  totalBoxShiftX: 12,
  totalBoxShiftY: 24,
  inWordsShiftX: 0,
  inWordsShiftY: -92,
  fontScale: 100,
  rowHeight: 24,
  colWidthSl: 42,
  colWidthQty: 44,
  colWidthRate: 53,
  colWidthAmount: 76,
  partyNameFontSize: 13,
  dateFontSize: 12,
  phoneFontSize: 11,
  addressFontSize: 12,
  tableHeaderFontSize: 11,
  itemRowsFontSize: 12,
  totalRowFontSize: 12,
  inWordsFontSize: 12,
};

/**
 * Ensures slip pad settings are initialized in localStorage if not already customized
 */
export function applyDefaultSlipPadSettings(forceReset = false): void {
  try {
    const keys: Record<string, string | number> = {
      polycables_slip_pad_top_offset: DEFAULT_SLIP_PAD_CONFIG.topMarginInch,
      polycables_slip_pad_left_offset: DEFAULT_SLIP_PAD_CONFIG.leftMarginInch,
      polycables_meta_top_offset: DEFAULT_SLIP_PAD_CONFIG.metaSectionPx,
      polycables_table_top_offset: DEFAULT_SLIP_PAD_CONFIG.tableSectionPx,
      polycables_footer_top_offset: DEFAULT_SLIP_PAD_CONFIG.footerPx,
      polycables_shift_date_x: DEFAULT_SLIP_PAD_CONFIG.dateShiftX,
      polycables_shift_date_y: DEFAULT_SLIP_PAD_CONFIG.dateShiftY,
      polycables_shift_name_x: DEFAULT_SLIP_PAD_CONFIG.partyNameShiftX,
      polycables_shift_name_y: DEFAULT_SLIP_PAD_CONFIG.partyNameShiftY,
      polycables_shift_phone_x: DEFAULT_SLIP_PAD_CONFIG.phoneShiftX,
      polycables_shift_phone_y: DEFAULT_SLIP_PAD_CONFIG.phoneShiftY,
      polycables_shift_address_x: DEFAULT_SLIP_PAD_CONFIG.addressShiftX,
      polycables_shift_address_y: DEFAULT_SLIP_PAD_CONFIG.addressShiftY,
      polycables_shift_col_sl_x: DEFAULT_SLIP_PAD_CONFIG.colSlShiftX,
      polycables_shift_col_sl_y: DEFAULT_SLIP_PAD_CONFIG.colSlShiftY,
      polycables_shift_col_desc_x: DEFAULT_SLIP_PAD_CONFIG.colDescShiftX,
      polycables_shift_col_desc_y: DEFAULT_SLIP_PAD_CONFIG.colDescShiftY,
      polycables_shift_col_qty_x: DEFAULT_SLIP_PAD_CONFIG.colQtyShiftX,
      polycables_shift_col_qty_y: DEFAULT_SLIP_PAD_CONFIG.colQtyShiftY,
      polycables_shift_col_rate_x: DEFAULT_SLIP_PAD_CONFIG.colRateShiftX,
      polycables_shift_col_rate_y: DEFAULT_SLIP_PAD_CONFIG.colRateShiftY,
      polycables_shift_col_amount_x: DEFAULT_SLIP_PAD_CONFIG.colAmountShiftX,
      polycables_shift_col_amount_y: DEFAULT_SLIP_PAD_CONFIG.colAmountShiftY,
      polycables_shift_total_box_x: DEFAULT_SLIP_PAD_CONFIG.totalBoxShiftX,
      polycables_shift_total_box_y: DEFAULT_SLIP_PAD_CONFIG.totalBoxShiftY,
      polycables_shift_in_words_x: DEFAULT_SLIP_PAD_CONFIG.inWordsShiftX,
      polycables_shift_in_words_y: DEFAULT_SLIP_PAD_CONFIG.inWordsShiftY,
      polycables_slip_pad_font_scale: DEFAULT_SLIP_PAD_CONFIG.fontScale,
      polycables_slip_pad_row_height: DEFAULT_SLIP_PAD_CONFIG.rowHeight,
      polycables_col_sl: DEFAULT_SLIP_PAD_CONFIG.colWidthSl,
      polycables_col_qty: DEFAULT_SLIP_PAD_CONFIG.colWidthQty,
      polycables_col_rate: DEFAULT_SLIP_PAD_CONFIG.colWidthRate,
      polycables_col_amount: DEFAULT_SLIP_PAD_CONFIG.colWidthAmount,
      polycables_font_party_name: DEFAULT_SLIP_PAD_CONFIG.partyNameFontSize,
      polycables_font_date: DEFAULT_SLIP_PAD_CONFIG.dateFontSize,
      polycables_font_phone: DEFAULT_SLIP_PAD_CONFIG.phoneFontSize,
      polycables_font_address: DEFAULT_SLIP_PAD_CONFIG.addressFontSize,
      polycables_font_table_header: DEFAULT_SLIP_PAD_CONFIG.tableHeaderFontSize,
      polycables_font_th: DEFAULT_SLIP_PAD_CONFIG.tableHeaderFontSize,
      polycables_font_table_row: DEFAULT_SLIP_PAD_CONFIG.itemRowsFontSize,
      polycables_font_tr: DEFAULT_SLIP_PAD_CONFIG.itemRowsFontSize,
      polycables_font_total_row: DEFAULT_SLIP_PAD_CONFIG.totalRowFontSize,
      polycables_font_total: DEFAULT_SLIP_PAD_CONFIG.totalRowFontSize,
      polycables_font_in_words: DEFAULT_SLIP_PAD_CONFIG.inWordsFontSize,
    };

    // Check if initial calibrated migration was performed
    const hasCalibrated = localStorage.getItem('polycables_slip_pad_calibrated_v2');
    if (forceReset || !hasCalibrated) {
      Object.entries(keys).forEach(([k, v]) => {
        localStorage.setItem(k, String(v));
      });
      localStorage.setItem('polycables_slip_pad_calibrated_v2', 'true');
    }
  } catch (err) {
    console.warn('Error applying slip pad defaults', err);
  }
}

// Auto-run when module is loaded
applyDefaultSlipPadSettings(false);
