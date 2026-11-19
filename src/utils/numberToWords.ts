export function convertToTakaWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Zero Taka Only';

  const single = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const double = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertLessThanThousand = (num: number): string => {
    let str = '';

    if (num >= 100) {
      str += single[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }

    if (num >= 10 && num < 20) {
      str += double[num - 10] + ' ';
    } else if (num >= 20) {
      str += tens[Math.floor(num / 10)] + ' ';
      if (num % 10 > 0) {
        str += single[num % 10] + ' ';
      }
    } else if (num > 0) {
      str += single[num] + ' ';
    }

    return str;
  };

  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);

  let num = integerPart;
  const parts: string[] = [];

  if (num >= 10000000) {
    // Crore
    const crore = Math.floor(num / 10000000);
    parts.push(convertLessThanThousand(crore).trim() + ' Crore');
    num %= 10000000;
  }

  if (num >= 100000) {
    // Lac
    const lac = Math.floor(num / 100000);
    parts.push(convertLessThanThousand(lac).trim() + ' Lac');
    num %= 100000;
  }

  if (num >= 1000) {
    // Thousand
    const thousand = Math.floor(num / 1000);
    parts.push(convertLessThanThousand(thousand).trim() + ' Thousand');
    num %= 1000;
  }

  if (num > 0) {
    const remainder = convertLessThanThousand(num).trim();
    if (parts.length > 0) {
      parts.push('and ' + remainder);
    } else {
      parts.push(remainder);
    }
  }

  let result = parts.join(' ').trim();
  if (!result) result = 'Zero';

  result = result + ' Taka';

  if (decimalPart > 0) {
    result += ' and ' + convertLessThanThousand(decimalPart).trim() + ' Poisha';
  }

  return result + ' Only.';
}

/**
 * Splits In-Words text cleanly into two lines matching the pad's 2 dotted lines:
 * Line 1: 'One Lac Twelve Thousand and'
 * Line 2: 'Five Hundred Taka Only.'
 */
export function splitWordsForPad(fullText: string): { line1: string; line2: string } {
  if (!fullText || !fullText.trim()) {
    return { line1: '', line2: '' };
  }

  const clean = fullText.trim();
  const words = clean.split(/\s+/);

  if (words.length <= 4) {
    return { line1: clean, line2: '' };
  }

  // Look for 'and' around the middle to break naturally
  const andIdx = words.findIndex((w, i) => w.toLowerCase() === 'and' && i >= 2 && i < words.length - 1);
  if (andIdx !== -1) {
    return {
      line1: words.slice(0, andIdx + 1).join(' '),
      line2: words.slice(andIdx + 1).join(' ')
    };
  }

  // Otherwise split in middle
  const mid = Math.ceil(words.length / 2);
  return {
    line1: words.slice(0, mid).join(' '),
    line2: words.slice(mid).join(' ')
  };
}
