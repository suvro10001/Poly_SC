/**
 * Color parser utility for PolyCables cable coils (Red, Black, Yellow, Green, Blue, White)
 * Supports plus notation e.g. "10+8+2+5" -> 10 Red, 8 Black, 2 Yellow, 5 Green
 */

export interface IdentifiedColors {
  isIdentified: boolean;
  total: number;
  red: number;
  black: number;
  yellow: number;
  green: number;
  blue: number;
  white: number;
  others?: number;
  plusFormula?: string;
  colors?: { [key: string]: number };
}

export function identifyColors(input: any): IdentifiedColors {
  const result: IdentifiedColors = {
    isIdentified: false,
    total: 0,
    red: 0,
    black: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    white: 0,
    colors: {}
  };

  if (!input) return result;

  if (typeof input === 'object') {
    if (input.red || input.black || input.yellow || input.green || input.blue || input.white) {
      result.red = Number(input.red) || 0;
      result.black = Number(input.black) || 0;
      result.yellow = Number(input.yellow) || 0;
      result.green = Number(input.green) || 0;
      result.blue = Number(input.blue) || 0;
      result.white = Number(input.white) || 0;
      result.total = result.red + result.black + result.yellow + result.green + result.blue + result.white;
      result.isIdentified = result.total > 0;
      result.colors = {
        Red: result.red,
        Black: result.black,
        Yellow: result.yellow,
        Green: result.green,
        Blue: result.blue,
        White: result.white
      };
      return result;
    }
    input = input.colorFormula || input.color || input.description || input.remarks || '';
  }

  const str = String(input).trim();
  if (!str) return result;

  // Plus notation: e.g. "10+8+2+5" or "10 + 8 + 2 + 5"
  if (str.includes('+') || /^\d+(\s*\+\s*\d+)+$/.test(str)) {
    const parts = str.split('+').map((p) => parseFloat(p.trim())).filter((n) => !isNaN(n));
    if (parts.length > 0) {
      // Standard cable industry color sequence: 1st Red, 2nd Black, 3rd Yellow, 4th Green, 5th Blue, 6th White
      if (parts[0]) result.red = parts[0];
      if (parts[1]) result.black = parts[1];
      if (parts[2]) result.yellow = parts[2];
      if (parts[3]) result.green = parts[3];
      if (parts[4]) result.blue = parts[4];
      if (parts[5]) result.white = parts[5];
      result.total = parts.reduce((sum, n) => sum + n, 0);
      result.isIdentified = true;
      result.colors = {
        Red: result.red,
        Black: result.black,
        Yellow: result.yellow,
        Green: result.green,
        Blue: result.blue,
        White: result.white
      };
      return result;
    }
  }

  // Regex check for named colors e.g. "10 Red, 5 Black"
  const redMatch = str.match(/(\d+)\s*(?:red|r\b)/i);
  const blackMatch = str.match(/(\d+)\s*(?:black|blk|b\b)/i);
  const yellowMatch = str.match(/(\d+)\s*(?:yellow|yel|y\b)/i);
  const greenMatch = str.match(/(\d+)\s*(?:green|grn|g\b)/i);
  const blueMatch = str.match(/(\d+)\s*(?:blue|blu)/i);
  const whiteMatch = str.match(/(\d+)\s*(?:white|wht|w\b)/i);

  if (redMatch || blackMatch || yellowMatch || greenMatch || blueMatch || whiteMatch) {
    result.red = redMatch ? parseInt(redMatch[1], 10) : 0;
    result.black = blackMatch ? parseInt(blackMatch[1], 10) : 0;
    result.yellow = yellowMatch ? parseInt(yellowMatch[1], 10) : 0;
    result.green = greenMatch ? parseInt(greenMatch[1], 10) : 0;
    result.blue = blueMatch ? parseInt(blueMatch[1], 10) : 0;
    result.white = whiteMatch ? parseInt(whiteMatch[1], 10) : 0;
    result.total = result.red + result.black + result.yellow + result.green + result.blue + result.white;
    result.isIdentified = result.total > 0;
    result.colors = {
      Red: result.red,
      Black: result.black,
      Yellow: result.yellow,
      Green: result.green,
      Blue: result.blue,
      White: result.white
    };
    return result;
  }

  return result;
}

export function buildPlusFormula(colors: any): string {
  if (!colors) return '';
  const r = Number(colors.red || colors.Red) || 0;
  const blk = Number(colors.black || colors.Black) || 0;
  const y = Number(colors.yellow || colors.Yellow) || 0;
  const g = Number(colors.green || colors.Green) || 0;
  const blu = Number(colors.blue || colors.Blue) || 0;
  const w = Number(colors.white || colors.White) || 0;

  const parts = [r, blk, y, g, blu, w];
  // Trim trailing zeros
  while (parts.length > 0 && parts[parts.length - 1] === 0) {
    parts.pop();
  }
  return parts.join('+');
}

export function formatColorText(identified: IdentifiedColors): string {
  if (!identified || !identified.isIdentified) return '';
  const items: string[] = [];
  if (identified.red) items.push(`${identified.red} Red`);
  if (identified.black) items.push(`${identified.black} Black`);
  if (identified.yellow) items.push(`${identified.yellow} Yellow`);
  if (identified.green) items.push(`${identified.green} Green`);
  if (identified.blue) items.push(`${identified.blue} Blue`);
  if (identified.white) items.push(`${identified.white} White`);
  return items.join(', ');
}
