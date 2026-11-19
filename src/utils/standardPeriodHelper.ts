import { formatDateDDMMYY, parseDateToISO } from './dateUtils';

export type StandardPeriodPreset =
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'all'
  | 'custom';

export interface DateRangeResult {
  preset: StandardPeriodPreset;
  startDate: string; // dd.mm.yy
  endDate: string;   // dd.mm.yy
  isAll: boolean;
}

export function calculatePeriodDates(preset: StandardPeriodPreset): DateRangeResult {
  const now = new Date();
  const currentYyyy = now.getFullYear();
  const currentMm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(currentYyyy).slice(-2);

  const prevMonthDate = new Date(currentYyyy, now.getMonth() - 1, 1);
  const prevYyyy = prevMonthDate.getFullYear();
  const prevMm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
  const prevYy = String(prevYyyy).slice(-2);

  const lastDayCurrentMonth = new Date(currentYyyy, now.getMonth() + 1, 0).getDate();
  const lastDayPrevMonth = new Date(prevYyyy, prevMonthDate.getMonth() + 1, 0).getDate();

  switch (preset) {
    case 'this_month':
      return {
        preset,
        startDate: `01.${currentMm}.${yy}`,
        endDate: `${String(lastDayCurrentMonth).padStart(2, '0')}.${currentMm}.${yy}`,
        isAll: false,
      };
    case 'last_month':
      return {
        preset,
        startDate: `01.${prevMm}.${prevYy}`,
        endDate: `${String(lastDayPrevMonth).padStart(2, '0')}.${prevMm}.${prevYy}`,
        isAll: false,
      };
    case 'this_year':
      return {
        preset,
        startDate: `01.01.${yy}`,
        endDate: `31.12.${yy}`,
        isAll: false,
      };
    case 'last_year':
      return {
        preset,
        startDate: `01.01.${prevYy}`,
        endDate: `31.12.${prevYy}`,
        isAll: false,
      };
    case 'all':
      return {
        preset,
        startDate: `01.01.${yy}`,
        endDate: '',
        isAll: true,
      };
    case 'custom':
    default:
      return {
        preset: 'custom',
        startDate: `01.${currentMm}.${yy}`,
        endDate: `${String(lastDayCurrentMonth).padStart(2, '0')}.${currentMm}.${yy}`,
        isAll: false,
      };
  }
}

/**
 * Checks if a given item date (supports "YYYY-MM-DD", "DD.MM.YY", "DD/MM/YYYY") falls within the standard range.
 */
export function isDateInPeriodRange(
  dateStr: string | undefined,
  preset: StandardPeriodPreset,
  customStart?: string,
  customEnd?: string
): boolean {
  if (preset === 'all') return true;
  if (!dateStr) return true;

  // Convert target item date to ISO format for safe alphabetical comparison
  const cleanDate = dateStr.trim();
  let itemIso = '';

  if (cleanDate.includes('-')) {
    // Already YYYY-MM-DD or similar
    itemIso = cleanDate.split('T')[0];
  } else if (cleanDate.includes('.')) {
    // DD.MM.YY or DD.MM.YYYY
    const parts = cleanDate.split('.');
    if (parts.length === 3) {
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      itemIso = `${y}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  } else if (cleanDate.includes('/')) {
    // DD/MM/YYYY
    const parts = cleanDate.split('/');
    if (parts.length === 3) {
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      itemIso = `${y}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  if (!itemIso) return true;

  let startIso = '';
  let endIso = '';

  if (preset === 'custom') {
    startIso = customStart ? parseDateToISO(customStart) : '';
    endIso = customEnd ? parseDateToISO(customEnd) : '';
  } else {
    const range = calculatePeriodDates(preset);
    startIso = parseDateToISO(range.startDate);
    endIso = parseDateToISO(range.endDate);
  }

  if (startIso && itemIso < startIso) return false;
  if (endIso && itemIso > endIso) return false;

  return true;
}
