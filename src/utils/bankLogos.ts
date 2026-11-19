import React from 'react';

export interface BankBrandData {
  name: string;
  shortCode: string;
  domain: string;
  bgHex: string;
  accentHex: string;
  textHex: string;
  svgIcon: string;
  logoUrl?: string;
}

export const BANK_LOGOS: Record<string, BankBrandData> = {
  // 1. Pubali Bank PLC
  'pubali bank plc': {
    name: 'Pubali Bank PLC',
    shortCode: 'PBL',
    domain: 'pubalibangla.com',
    bgHex: '#006a4e',
    accentHex: '#fbbf24',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Pubali_Bank_Logo.svg/320px-Pubali_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="22" fill="#006A4E" stroke="#F59E0B" stroke-width="2"/>
        <circle cx="24" cy="24" r="17" fill="#00523C"/>
        <path d="M24 10V38M24 16L18 22M24 22L16 30M24 16L30 22M24 22L32 30" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="24" cy="12" r="2" fill="#FBBF24"/>
      </svg>
    `
  },
  'pubali bank': {
    name: 'Pubali Bank PLC',
    shortCode: 'PBL',
    domain: 'pubalibangla.com',
    bgHex: '#006a4e',
    accentHex: '#fbbf24',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Pubali_Bank_Logo.svg/320px-Pubali_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="22" fill="#006A4E" stroke="#F59E0B" stroke-width="2"/>
        <path d="M24 10V38M24 16L18 22M24 22L16 30M24 16L30 22M24 22L32 30" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    `
  },

  // 2. Dutch-Bangla Bank PLC
  'dutch-bangla bank plc': {
    name: 'Dutch-Bangla Bank PLC',
    shortCode: 'DBBL',
    domain: 'dutchbanglabank.com',
    bgHex: '#C8102E',
    accentHex: '#10B981',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Dutch-Bangla_Bank_Logo.svg/320px-Dutch-Bangla_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#C8102E"/>
        <path d="M24 9L36 30H12L24 9Z" fill="#10B981"/>
        <circle cx="24" cy="35" r="4" fill="#FFFFFF"/>
        <path d="M24 18L30 29H18L24 18Z" fill="#FFFFFF"/>
      </svg>
    `
  },
  'dutch-bangla bank': {
    name: 'Dutch-Bangla Bank PLC',
    shortCode: 'DBBL',
    domain: 'dutchbanglabank.com',
    bgHex: '#C8102E',
    accentHex: '#10B981',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Dutch-Bangla_Bank_Logo.svg/320px-Dutch-Bangla_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#C8102E"/>
        <path d="M24 9L36 30H12L24 9Z" fill="#10B981"/>
        <circle cx="24" cy="35" r="4" fill="#FFFFFF"/>
      </svg>
    `
  },
  'dbbl': {
    name: 'Dutch-Bangla Bank PLC',
    shortCode: 'DBBL',
    domain: 'dutchbanglabank.com',
    bgHex: '#C8102E',
    accentHex: '#10B981',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Dutch-Bangla_Bank_Logo.svg/320px-Dutch-Bangla_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#C8102E"/>
        <path d="M24 9L36 30H12L24 9Z" fill="#10B981"/>
      </svg>
    `
  },

  // 3. NCC Bank PLC
  'ncc bank plc': {
    name: 'NCC Bank PLC',
    shortCode: 'NCCB',
    domain: 'nccbank.com.bd',
    bgHex: '#0F766E',
    accentHex: '#F59E0B',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/NCC_Bank_Logo.svg/320px-NCC_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#0F766E"/>
        <circle cx="24" cy="24" r="14" stroke="#F59E0B" stroke-width="3"/>
        <path d="M17 17V31L25 21V31M31 17V31" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    `
  },
  'ncc bank': {
    name: 'NCC Bank PLC',
    shortCode: 'NCCB',
    domain: 'nccbank.com.bd',
    bgHex: '#0F766E',
    accentHex: '#F59E0B',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/NCC_Bank_Logo.svg/320px-NCC_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#0F766E"/>
        <circle cx="24" cy="24" r="14" stroke="#F59E0B" stroke-width="3"/>
        <path d="M17 17V31L25 21V31M31 17V31" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    `
  },

  // 4. BRAC Bank PLC
  'brac bank plc': {
    name: 'BRAC Bank PLC',
    shortCode: 'BBL',
    domain: 'bracbank.com',
    bgHex: '#004B87',
    accentHex: '#FBBF24',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/BRAC_Bank_logo.svg/320px-BRAC_Bank_logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#004B87"/>
        <rect x="12" y="12" width="10" height="10" fill="#FBBF24"/>
        <rect x="26" y="12" width="10" height="10" fill="#FFFFFF"/>
        <rect x="12" y="26" width="10" height="10" fill="#FFFFFF"/>
        <rect x="26" y="26" width="10" height="10" fill="#00833E"/>
      </svg>
    `
  },
  'brac bank': {
    name: 'BRAC Bank PLC',
    shortCode: 'BBL',
    domain: 'bracbank.com',
    bgHex: '#004B87',
    accentHex: '#FBBF24',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/BRAC_Bank_logo.svg/320px-BRAC_Bank_logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#004B87"/>
        <rect x="12" y="12" width="10" height="10" fill="#FBBF24"/>
        <rect x="26" y="12" width="10" height="10" fill="#FFFFFF"/>
        <rect x="12" y="26" width="10" height="10" fill="#FFFFFF"/>
        <rect x="26" y="26" width="10" height="10" fill="#00833E"/>
      </svg>
    `
  },

  // 5. Islami Bank Bangladesh PLC
  'islami bank bangladesh plc': {
    name: 'Islami Bank Bangladesh PLC',
    shortCode: 'IBBL',
    domain: 'islamibankbd.com',
    bgHex: '#0B723B',
    accentHex: '#F59E0B',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/26/Islami_Bank_Bangladesh_Limited_logo.svg/320px-Islami_Bank_Bangladesh_Limited_logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#0B723B"/>
        <path d="M24 10C16.268 10 10 16.268 10 24C10 31.732 16.268 38 24 38C26.5 38 28.8 37.3 30.8 36.1C26.5 34.6 23.5 30.6 23.5 25.8C23.5 20.2 27.5 15.6 32.7 14.5C30.2 11.7 26.5 10 24 10Z" fill="#FBBF24"/>
        <circle cx="33" cy="18" r="3" fill="#FFFFFF"/>
      </svg>
    `
  },
  'islami bank': {
    name: 'Islami Bank Bangladesh PLC',
    shortCode: 'IBBL',
    domain: 'islamibankbd.com',
    bgHex: '#0B723B',
    accentHex: '#F59E0B',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/26/Islami_Bank_Bangladesh_Limited_logo.svg/320px-Islami_Bank_Bangladesh_Limited_logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#0B723B"/>
        <path d="M24 10C16.268 10 10 16.268 10 24C10 31.732 16.268 38 24 38C26.5 38 28.8 37.3 30.8 36.1C26.5 34.6 23.5 30.6 23.5 25.8C23.5 20.2 27.5 15.6 32.7 14.5C30.2 11.7 26.5 10 24 10Z" fill="#FBBF24"/>
      </svg>
    `
  },

  // 6. Sonali Bank PLC
  'sonali bank plc': {
    name: 'Sonali Bank PLC',
    shortCode: 'SBL',
    domain: 'sonalibank.com.bd',
    bgHex: '#F37023',
    accentHex: '#FBBF24',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Sonali_Bank_logo.svg/320px-Sonali_Bank_logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#F37023"/>
        <circle cx="24" cy="24" r="14" fill="#FBBF24"/>
        <path d="M24 10V14M24 34V38M10 24H14M34 24H38M14.1 14.1L16.9 16.9M31.1 31.1L33.9 33.9M14.1 33.9L16.9 31.1M31.1 16.9L33.9 14.1" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="24" cy="24" r="6" fill="#F37023"/>
      </svg>
    `
  },
  'sonali bank': {
    name: 'Sonali Bank PLC',
    shortCode: 'SBL',
    domain: 'sonalibank.com.bd',
    bgHex: '#F37023',
    accentHex: '#FBBF24',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Sonali_Bank_logo.svg/320px-Sonali_Bank_logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#F37023"/>
        <circle cx="24" cy="24" r="14" fill="#FBBF24"/>
      </svg>
    `
  },

  // 7. The City Bank PLC
  'the city bank plc': {
    name: 'The City Bank PLC',
    shortCode: 'CBL',
    domain: 'thecitybank.com',
    bgHex: '#D8232A',
    accentHex: '#FFFFFF',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/City_Bank_Logo.svg/320px-City_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#D8232A"/>
        <path d="M24 8L38 24L24 40L10 24L24 8Z" fill="#FFFFFF"/>
        <path d="M24 16L32 24L24 32L16 24L24 16Z" fill="#D8232A"/>
      </svg>
    `
  },
  'city bank': {
    name: 'The City Bank PLC',
    shortCode: 'CBL',
    domain: 'thecitybank.com',
    bgHex: '#D8232A',
    accentHex: '#FFFFFF',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/City_Bank_Logo.svg/320px-City_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#D8232A"/>
        <path d="M24 8L38 24L24 40L10 24L24 8Z" fill="#FFFFFF"/>
      </svg>
    `
  },

  // 8. Eastern Bank PLC
  'eastern bank plc': {
    name: 'Eastern Bank PLC',
    shortCode: 'EBL',
    domain: 'ebl.com.bd',
    bgHex: '#00833E',
    accentHex: '#0284C7',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Eastern_Bank_Logo.svg/320px-Eastern_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#00833E"/>
        <path d="M12 24C12 17.37 17.37 12 24 12C30.63 12 36 17.37 36 24C36 30.63 30.63 36 24 36" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
        <circle cx="24" cy="24" r="5" fill="#0284C7"/>
      </svg>
    `
  },
  'eastern bank': {
    name: 'Eastern Bank PLC',
    shortCode: 'EBL',
    domain: 'ebl.com.bd',
    bgHex: '#00833E',
    accentHex: '#0284C7',
    textHex: '#ffffff',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Eastern_Bank_Logo.svg/320px-Eastern_Bank_Logo.svg.png',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#00833E"/>
        <path d="M12 24C12 17.37 17.37 12 24 12C30.63 12 36 17.37 36 24" stroke="#FFFFFF" stroke-width="3"/>
      </svg>
    `
  },

  // 9. Head Office / H/O (Poly Cables)
  'h/o': {
    name: 'Head Office (H/O)',
    shortCode: 'H/O',
    domain: 'polycables.com.bd',
    bgHex: '#1E293B',
    accentHex: '#38BDF8',
    textHex: '#ffffff',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#0F172A" stroke="#38BDF8" stroke-width="1.5"/>
        <path d="M14 34V18L24 10L34 18V34H26V26H22V34H14Z" fill="#38BDF8"/>
        <circle cx="24" cy="18" r="3" fill="#FFFFFF"/>
      </svg>
    `
  },
  'head office': {
    name: 'Head Office (H/O)',
    shortCode: 'H/O',
    domain: 'polycables.com.bd',
    bgHex: '#1E293B',
    accentHex: '#38BDF8',
    textHex: '#ffffff',
    svgIcon: `
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="42" height="42" rx="10" fill="#0F172A" stroke="#38BDF8" stroke-width="1.5"/>
        <path d="M14 34V18L24 10L34 18V34H26V26H22V34H14Z" fill="#38BDF8"/>
      </svg>
    `
  }
};

/**
 * Returns matching bank logo and styling for any bank name string.
 */
export function getBankBrand(bankName?: string): BankBrandData {
  if (!bankName) {
    return {
      name: 'Bank Account',
      shortCode: 'BNK',
      domain: '',
      bgHex: '#334155',
      accentHex: '#94A3B8',
      textHex: '#ffffff',
      svgIcon: ''
    };
  }

  const clean = bankName.trim().toLowerCase();
  if (BANK_LOGOS[clean]) return BANK_LOGOS[clean];

  for (const [key, val] of Object.entries(BANK_LOGOS)) {
    if (clean.includes(key) || key.includes(clean)) {
      return val;
    }
  }

  const initials = clean
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'BNK';

  return {
    name: bankName,
    shortCode: initials,
    domain: '',
    bgHex: '#1E293B',
    accentHex: '#64748B',
    textHex: '#ffffff',
    svgIcon: ''
  };
}
