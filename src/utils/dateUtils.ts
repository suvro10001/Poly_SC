/**
 * Formats a date string or Date object into `dd.mm.yy` format.
 * Examples:
 *   `2026-08-11` -> `11.08.26`
 *   `11.8.26` -> `11.08.26`
 *   `6.8.2026` -> `06.08.26`
 *   `11/08/2026` -> `11.08.26`
 */
export function formatDateDDMMYY(dateInput?: any): string {
  if (!dateInput) return '';

  // 1. Support Firestore Timestamp object with .toDate() or .seconds
  if (typeof dateInput === 'object') {
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
      const day = String(dateInput.getDate()).padStart(2, '0');
      const month = String(dateInput.getMonth() + 1).padStart(2, '0');
      const year = String(dateInput.getFullYear()).slice(-2);
      return `${day}.${month}.${year}`;
    }
    if (typeof dateInput.toDate === 'function') {
      try {
        const d = dateInput.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = String(d.getFullYear()).slice(-2);
          return `${day}.${month}.${year}`;
        }
      } catch {}
    }
    if (typeof dateInput.seconds === 'number') {
      const d = new Date(dateInput.seconds * 1000);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = String(d.getFullYear()).slice(-2);
        return `${day}.${month}.${year}`;
      }
    }
  }

  // 2. Support numeric epoch timestamp
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = String(d.getFullYear()).slice(-2);
      return `${day}.${month}.${year}`;
    }
  }

  if (typeof dateInput === 'string') {
    let trimmed = dateInput.trim();
    if (!trimmed) return '';

    // If already in strict DD.MM.YY format (e.g. 06.08.26)
    if (/^\d{2}\.\d{2}\.\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    // Strip time portion if present (e.g. "2026-07-01T12:00:00Z" or "2026-07-01 12:00:00")
    if (trimmed.includes('T') || (trimmed.includes(' ') && /[-/.]/.test(trimmed))) {
      const datePart = trimmed.split(/[T\s]/)[0].trim();
      if (datePart && /^\d{2}\.\d{2}\.\d{2}$/.test(datePart)) {
        return datePart;
      }
      if (datePart && datePart.length >= 6) {
        trimmed = datePart;
      }
    }

    // 6 numeric digits: DDMMYY (e.g. 050926 -> 05.09.26)
    if (/^\d{6}$/.test(trimmed)) {
      const day = trimmed.slice(0, 2);
      const month = trimmed.slice(2, 4);
      const year = trimmed.slice(4, 6);
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
        return `${day}.${month}.${year}`;
      }
    }

    // 8 numeric digits: DDMMYYYY (e.g. 05092026 -> 05.09.26)
    if (/^\d{8}$/.test(trimmed)) {
      const day = trimmed.slice(0, 2);
      const month = trimmed.slice(2, 4);
      const year = trimmed.slice(6, 8);
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
        return `${day}.${month}.${year}`;
      }
    }

    // Try splitting by dots, slashes, or hyphens for DD.MM.YY / DD.MM.YYYY / D.M.YY / YYYY-MM-DD
    const parts = trimmed.split(/[.\/-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD or YYYY.MM.DD
        const [yearStr, monthStr, dayStr] = parts;
        const day = dayStr.padStart(2, '0');
        const month = monthStr.padStart(2, '0');
        const year = yearStr.slice(-2);
        return `${day}.${month}.${year}`;
      } else {
        // DD.MM.YY or DD.MM.YYYY or D.M.YY
        const dayNum = parseInt(parts[0], 10);
        const monthNum = parseInt(parts[1], 10);
        let yearStr = parts[2].trim();
        if (yearStr.length === 4) yearStr = yearStr.slice(-2);

        if (!isNaN(dayNum) && !isNaN(monthNum) && dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
          const day = String(dayNum).padStart(2, '0');
          const month = String(monthNum).padStart(2, '0');
          const year = yearStr.padStart(2, '0').slice(-2);
          return `${day}.${month}.${year}`;
        }
      }
    }

    // Guard: Parse with Date object
    if (trimmed.length >= 8 && (/[-/,\s]/.test(trimmed) || /[a-zA-Z]/.test(trimmed))) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = String(d.getFullYear()).slice(-2);
        return `${day}.${month}.${year}`;
      }
    }

    return trimmed;
  }

  return '';
}

/**
 * Converts any date format (e.g. `11.08.26`, `11.08.2026`, `2026-08-11`)
 * to `YYYY-MM-DD` ISO format for HTML5 `<input type="date" />`.
 */
export function parseDateToISO(dateInput?: any): string {
  if (!dateInput) return '';

  // Handle Firestore Timestamp objects or epoch numbers
  if (typeof dateInput === 'number' && !isNaN(dateInput)) {
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) {
      const yStr = String(d.getFullYear());
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      return `${yStr}-${mStr}-${dStr}`;
    }
    return '';
  }

  if (typeof dateInput === 'object' && !(dateInput instanceof Date)) {
    if (typeof dateInput.toDate === 'function') {
      try {
        const d = dateInput.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) {
          const yStr = String(d.getFullYear());
          const mStr = String(d.getMonth() + 1).padStart(2, '0');
          const dStr = String(d.getDate()).padStart(2, '0');
          return `${yStr}-${mStr}-${dStr}`;
        }
      } catch {}
    }
    if (typeof dateInput.seconds === 'number') {
      const d = new Date(dateInput.seconds * 1000);
      if (!isNaN(d.getTime())) {
        const yStr = String(d.getFullYear());
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const dStr = String(d.getDate()).padStart(2, '0');
        return `${yStr}-${mStr}-${dStr}`;
      }
    }
    return '';
  }

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return '';

    // If already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.substring(0, 10);
    }

    // If DD.MM.YY or DD.MM.YYYY or DD/MM/YY or DD/MM/YYYY
    const parts = trimmed.split(/[.\/-]/);
    if (parts.length === 3) {
      let p1 = parseInt(parts[0], 10); // Day
      let p2 = parseInt(parts[1], 10); // Month
      let p3 = parseInt(parts[2], 10); // Year

      if (parts[0].length === 4) {
        // YYYY.MM.DD
        p3 = parseInt(parts[0], 10);
        p2 = parseInt(parts[1], 10);
        p1 = parseInt(parts[2], 10);
      } else {
        // DD.MM.YY or DD.MM.YYYY
        if (p3 < 100) p3 += 2000;
      }

      if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3) && p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
        const yStr = String(p3);
        const mStr = String(p2).padStart(2, '0');
        const dStr = String(p1).padStart(2, '0');
        return `${yStr}-${mStr}-${dStr}`;
      }
    }

    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const yStr = String(d.getFullYear());
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      return `${yStr}-${mStr}-${dStr}`;
    }
  }

  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    const yStr = String(dateInput.getFullYear());
    const mStr = String(dateInput.getMonth() + 1).padStart(2, '0');
    const dStr = String(dateInput.getDate()).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  }

  return '';
}

/**
 * Returns today's date in `YYYY-MM-DD` ISO format.
 */
export function getTodayISO(): string {
  const d = new Date();
  const yStr = String(d.getFullYear());
  const mStr = String(d.getMonth() + 1).padStart(2, '0');
  const dStr = String(d.getDate()).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Returns today's date in `dd.mm.yy` format.
 */
export function getTodayDDMMYY(): string {
  return formatDateDDMMYY(new Date());
}

/**
 * Returns the running (current) month range in DD.MM.YY format and ISO formats.
 * e.g. { startDate: '01.09.26', endDate: '30.09.26', startISO: '2026-09-01', endISO: '2026-09-30', monthISO: '2026-09' }
 */
export function getRunningMonthRange(): {
  startDate: string;
  endDate: string;
  startISO: string;
  endISO: string;
  monthISO: string;
} {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 to 11
  const startDay = '01';
  const endObj = new Date(year, month + 1, 0); // last day of current month
  const endDay = String(endObj.getDate()).padStart(2, '0');
  const monthStr = String(month + 1).padStart(2, '0');
  const yyStr = String(year).slice(-2);

  return {
    startDate: `${startDay}.${monthStr}.${yyStr}`,
    endDate: `${endDay}.${monthStr}.${yyStr}`,
    startISO: `${year}-${monthStr}-01`,
    endISO: `${year}-${monthStr}-${endDay}`,
    monthISO: `${year}-${monthStr}`
  };
}

/**
 * Given a date input (in dd.mm.yy, dd.mm.yyyy, YYYY-MM-DD, or any string with a year),
 * extracts the year and returns the last date of that year in dd.mm.yy format (e.g. 31.12.26).
 * Example: '01.07.26' -> '31.12.26', '2026-05-15' -> '31.12.26', '12.03.2026' -> '31.12.26'.
 */
export function getLastDateOfYearFromDate(dateInput?: string | Date | null): string | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    const yr = String(dateInput.getFullYear()).slice(-2);
    return `31.12.${yr}`;
  }

  const trimmed = String(dateInput).trim();
  if (!trimmed) return null;

  // 1. ISO format YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-\d{1,2}-\d{1,2}/);
  if (isoMatch) {
    const yr = isoMatch[1].slice(-2);
    return `31.12.${yr}`;
  }

  // 2. 4-digit year like 2026
  const fullYearMatch = trimmed.match(/\b(20\d\d)\b/);
  if (fullYearMatch) {
    const yr = fullYearMatch[1].slice(-2);
    return `31.12.${yr}`;
  }

  // 3. DD.MM.YY or DD/MM/YY or DD-MM-YY
  const parts = trimmed.split(/[.\/-]/);
  if (parts.length === 3) {
    let yr = parts[2].trim();
    if (yr.length === 4) yr = yr.slice(-2);
    if (/^\d{2}$/.test(yr)) {
      return `31.12.${yr}`;
    }
  }

  // 4. 6-digit DDMMYY
  if (/^\d{6}$/.test(trimmed)) {
    const yr = trimmed.slice(4, 6);
    return `31.12.${yr}`;
  }

  return null;
}


