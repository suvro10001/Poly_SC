/**
 * Helper to download raw text content as a file in browser
 */
export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  try {
    const cleanFilename = filename.endsWith('.txt') ? filename : `${filename}.txt`;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = cleanFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download text file:', error);
  }
}

/**
 * Format headers and row cells into a clean ASCII text table
 */
export function formatAsciiTable(
  headers: string[],
  rows: (string | number)[][],
  alignments: ('left' | 'center' | 'right')[] = []
): string {
  if (headers.length === 0) return '';

  const colWidths: number[] = headers.map((h, i) => {
    let maxLen = (h || '').toString().length;
    for (const row of rows) {
      const cell = (row[i] !== undefined && row[i] !== null ? row[i] : '').toString();
      if (cell.length > maxLen) {
        maxLen = cell.length;
      }
    }
    return maxLen;
  });

  const padCell = (content: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string => {
    const diff = width - content.length;
    if (diff <= 0) return content;
    if (align === 'right') {
      return ' '.repeat(diff) + content;
    }
    if (align === 'center') {
      const left = Math.floor(diff / 2);
      const right = diff - left;
      return ' '.repeat(left) + content + ' '.repeat(right);
    }
    return content + ' '.repeat(diff);
  };

  const separator = '+-' + colWidths.map((w) => '-'.repeat(w)).join('-+-') + '-+';

  const headerRow =
    '| ' +
    headers
      .map((h, i) => padCell(h, colWidths[i], alignments[i] || 'left'))
      .join(' | ') +
    ' |';

  const dataRows = rows.map((row) => {
    return (
      '| ' +
      headers
        .map((_, i) => {
          const cellStr = (row[i] !== undefined && row[i] !== null ? row[i] : '').toString();
          return padCell(cellStr, colWidths[i], alignments[i] || 'left');
        })
        .join(' | ') +
      ' |'
    );
  });

  return [separator, headerRow, separator, ...dataRows, separator].join('\n');
}
