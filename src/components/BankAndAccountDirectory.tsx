import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Wallet,
  Plus,
  Trash2,
  Edit2,
  RotateCcw,
  Search,
  Check,
  X,
  Tag,
  ShieldAlert,
  ArrowRight,
  Landmark,
  Image as ImageIcon
} from 'lucide-react';
import { defaultBanks, defaultAccounts } from '../data/defaultData';

export interface BankBrandInfo {
  domain: string;
  shortCode: string;
  bgHex: string;
  textHex: string;
  initials: string;
  logoUrl?: string;
  isWide?: boolean;
  svgIcon?: string;
}

const mkBankTile = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="100%" height="100%"><rect width="36" height="36" rx="6" fill="#ffffff"/>${inner}</svg>`;

const mkMonogramTile = (color: string, accent: string, inner: string): string =>
  mkBankTile(`<rect x="2" y="2" width="32" height="32" rx="5" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-width="1.4"/>${inner}<rect x="5" y="27" width="26" height="3.2" rx="1.5" fill="${accent}"/>`);

const HO_SVG = mkBankTile(`<path d="M7 15 L18 6 L29 15 V25 H7 Z" fill="#1e293b"/><rect x="14.5" y="16.5" width="7" height="8.5" fill="#f59e0b"/><rect x="5.5" y="26.5" width="25" height="5.5" rx="1.5" fill="#f59e0b"/><text x="18" y="30.7" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="4.4" fill="#0f172a">H/O</text>`);

const PUBALI_INFO: BankBrandInfo = { domain: 'pubalibangla.com', shortCode: 'PBL', bgHex: '#006a4e', textHex: '#ffffff', initials: 'PBL', logoUrl: '/bank-logos/pubali.svg', isWide: true };
const DBBL_INFO: BankBrandInfo = { domain: 'dutchbanglabank.com', shortCode: 'DBBL', bgHex: '#c8102e', textHex: '#ffffff', initials: 'DBBL', logoUrl: '/bank-logos/dbbl.svg', isWide: true };
const IBBL_INFO: BankBrandInfo = { domain: 'islamibankbd.com', shortCode: 'IBBL', bgHex: '#0b723b', textHex: '#ffffff', initials: 'IBBL', logoUrl: '/bank-logos/ibbl.svg', isWide: true };
const SONALI_INFO: BankBrandInfo = { domain: 'sonalibank.com.bd', shortCode: 'SBL', bgHex: '#f37023', textHex: '#ffffff', initials: 'SBL', logoUrl: '/bank-logos/sonali.svg', isWide: false };
const BRAC_INFO: BankBrandInfo = { domain: 'bracbank.com', shortCode: 'BBL', bgHex: '#004b87', textHex: '#ffffff', initials: 'BBL', logoUrl: '/bank-logos/brac.svg', isWide: true };
const CITY_INFO: BankBrandInfo = { domain: 'thecitybank.com', shortCode: 'CBL', bgHex: '#d8232a', textHex: '#ffffff', initials: 'CBL', logoUrl: '/bank-logos/city.svg', isWide: false };
const EBL_INFO: BankBrandInfo = { domain: 'ebl.com.bd', shortCode: 'EBL', bgHex: '#00833e', textHex: '#ffffff', initials: 'EBL', logoUrl: '/bank-logos/eastern.svg', isWide: false };
const SCB_INFO: BankBrandInfo = { domain: 'sc.com', shortCode: 'SCB', bgHex: '#0072bc', textHex: '#ffffff', initials: 'SCB', logoUrl: '/bank-logos/scb.svg', isWide: true };
const HSBC_INFO: BankBrandInfo = { domain: 'hsbc.com.bd', shortCode: 'HSBC', bgHex: '#db0011', textHex: '#ffffff', initials: 'HSBC', logoUrl: '/bank-logos/hsbc.svg', isWide: true };
const BANK_ASIA_INFO: BankBrandInfo = { domain: 'bankasia-bd.com', shortCode: 'ASIA', bgHex: '#003366', textHex: '#ffffff', initials: 'BA', logoUrl: '/bank-logos/bank_asia.svg', isWide: true };
const UTTARA_INFO: BankBrandInfo = { domain: 'uttarabank-bd.com', shortCode: 'UBL', bgHex: '#1e3a8a', textHex: '#ffffff', initials: 'UBL', logoUrl: '/bank-logos/uttara.svg', isWide: true };
const JANATA_INFO: BankBrandInfo = { domain: 'jb.com.bd', shortCode: 'JBL', bgHex: '#047857', textHex: '#ffffff', initials: 'JBL', logoUrl: '/bank-logos/janata.svg', isWide: false };
const AGRANI_INFO: BankBrandInfo = { domain: 'agranibank.org', shortCode: 'ABL', bgHex: '#15803d', textHex: '#ffffff', initials: 'ABL', logoUrl: '/bank-logos/agrani.svg', isWide: false };
const RUPALI_INFO: BankBrandInfo = { domain: 'rupalibank.org', shortCode: 'RBL', bgHex: '#b91c1c', textHex: '#ffffff', initials: 'RBL', logoUrl: '/bank-logos/rupali.svg', isWide: true };
const PRIME_INFO: BankBrandInfo = { domain: 'primebank.com.bd', shortCode: 'PRIME', bgHex: '#1d4ed8', textHex: '#ffffff', initials: 'PRIME', logoUrl: '/bank-logos/prime.svg', isWide: true };
const UCB_INFO: BankBrandInfo = { domain: 'ucb.com.bd', shortCode: 'UCB', bgHex: '#ea580c', textHex: '#ffffff', initials: 'UCB', logoUrl: '/bank-logos/ucb.svg', isWide: true };
const MTB_INFO: BankBrandInfo = { domain: 'mutualtrustbank.com', shortCode: 'MTB', bgHex: '#4338ca', textHex: '#ffffff', initials: 'MTB', logoUrl: '/bank-logos/mtb.png', isWide: false };
const STANDARD_INFO: BankBrandInfo = { domain: 'standardbankbd.com', shortCode: 'STBL', bgHex: '#0284c7', textHex: '#ffffff', initials: 'STBL', logoUrl: '/bank-logos/standard.png', isWide: false };
const MERCANTILE_INFO: BankBrandInfo = { domain: 'mblbd.com', shortCode: 'MBL', bgHex: '#be123c', textHex: '#ffffff', initials: 'MBL', logoUrl: '/bank-logos/mercantile.jpg', isWide: true };
const NCC_INFO: BankBrandInfo = { domain: 'nccbank.com.bd', shortCode: 'NCCB', bgHex: '#0f766e', textHex: '#ffffff', initials: 'NCCB', logoUrl: '/bank-logos/ncc.png', isWide: true };
const SOUTHEAST_INFO: BankBrandInfo = { domain: 'southeastbank.com.bd', shortCode: 'SEBL', bgHex: '#7c3aed', textHex: '#ffffff', initials: 'SEBL', logoUrl: '/bank-logos/southeast.svg', isWide: true };
const ALARAFAH_INFO: BankBrandInfo = { domain: 'aibl.com.bd', shortCode: 'AIBL', bgHex: '#047857', textHex: '#ffffff', initials: 'AIBL', logoUrl: '/bank-logos/alarafah.png', isWide: false };
const FSIBL_INFO: BankBrandInfo = { domain: 'fsiblbd.com', shortCode: 'FSIBL', bgHex: '#059669', textHex: '#ffffff', initials: 'FSIBL', logoUrl: '/bank-logos/fsibl.svg', isWide: false };
const SIBL_INFO: BankBrandInfo = { domain: 'siblbd.com', shortCode: 'SIBL', bgHex: '#047857', textHex: '#ffffff', initials: 'SIBL', logoUrl: '/bank-logos/sibl.svg', isWide: true };
const IFIC_INFO: BankBrandInfo = { domain: 'ificbank.com.bd', shortCode: 'IFIC', bgHex: '#b91c1c', textHex: '#ffffff', initials: 'IFIC', logoUrl: '/bank-logos/ific.svg', isWide: true };
const DHAKA_INFO: BankBrandInfo = { domain: 'dhakabank.com.bd', shortCode: 'DBL', bgHex: '#0369a1', textHex: '#ffffff', initials: 'DBL', logoUrl: '/bank-logos/dhaka.svg', isWide: true };
const AB_INFO: BankBrandInfo = { domain: 'abbl.com', shortCode: 'ABBL', bgHex: '#1e40af', textHex: '#ffffff', initials: 'ABBL', logoUrl: '/bank-logos/ab.svg', isWide: true };
const EXIM_INFO: BankBrandInfo = { domain: 'eximbankbd.com', shortCode: 'EXIM', bgHex: '#0d9488', textHex: '#ffffff', initials: 'EXIM', logoUrl: '/bank-logos/exim.svg', isWide: true };
const SJIBL_INFO: BankBrandInfo = { domain: 'sjiblbd.com', shortCode: 'SJIBL', bgHex: '#047857', textHex: '#ffffff', initials: 'SJIBL', logoUrl: '/bank-logos/sjibl.jpg', isWide: true };
const NATIONAL_INFO: BankBrandInfo = { domain: 'nblbd.com', shortCode: 'NBL', bgHex: '#b45309', textHex: '#ffffff', initials: 'NBL', logoUrl: '/bank-logos/national.jpg', isWide: true };
const ONE_INFO: BankBrandInfo = { domain: 'onebank.com.bd', shortCode: 'OBL', bgHex: '#be185d', textHex: '#ffffff', initials: 'OBL', logoUrl: '/bank-logos/one.svg', isWide: true };
const JAMUNA_INFO: BankBrandInfo = { domain: 'jamunabank.com.bd', shortCode: 'JAMUNA', bgHex: '#6d28d9', textHex: '#ffffff', initials: 'JAMUNA', logoUrl: '/bank-logos/jamuna.svg', isWide: true };
const TRUST_INFO: BankBrandInfo = { domain: 'tblbd.com', shortCode: 'TBL', bgHex: '#15803d', textHex: '#ffffff', initials: 'TBL', logoUrl: '/bank-logos/trust.svg', isWide: true };
const MIDLAND_INFO: BankBrandInfo = { domain: 'midlandbankbd.net', shortCode: 'MDB', bgHex: '#0284c7', textHex: '#ffffff', initials: 'MDB', logoUrl: '/bank-logos/midland.svg', isWide: true };
const MEGHNA_INFO: BankBrandInfo = { domain: 'meghnabank.com.bd', shortCode: 'MGBL', bgHex: '#e11d48', textHex: '#ffffff', initials: 'MGBL', logoUrl: '/bank-logos/meghna.jpg', isWide: true };
const MODHUMOTI_INFO: BankBrandInfo = { domain: 'modhumotibankltd.com', shortCode: 'MDBL', bgHex: '#047857', textHex: '#ffffff', initials: 'MODHU', logoUrl: '/bank-logos/modhumoti.svg', isWide: true };
const NRB_INFO: BankBrandInfo = { domain: 'nrbbankbd.com', shortCode: 'NRBB', bgHex: '#0369a1', textHex: '#ffffff', initials: 'NRBB', logoUrl: '/bank-logos/nrb.svg', isWide: true };
const NRBC_INFO: BankBrandInfo = { domain: 'nrbcommercialbank.com', shortCode: 'NRBC', bgHex: '#1e3a8a', textHex: '#ffffff', initials: 'NRBC', logoUrl: '/bank-logos/nrbc.png', isWide: true };
const LANKA_INFO: BankBrandInfo = { domain: 'lankabangla.com', shortCode: 'LBF', bgHex: '#e11d48', textHex: '#ffffff', initials: 'LBF', logoUrl: '/bank-logos/lankabangla.svg', isWide: true };
const SHIMANTO_INFO: BankBrandInfo = { domain: 'shimantobank.com', shortCode: 'SBL', bgHex: '#365314', textHex: '#ffffff', initials: 'SHIM', logoUrl: '/bank-logos/shimanto.png', isWide: true };
const GLOBAL_INFO: BankBrandInfo = { domain: 'globalislamibankbd.com', shortCode: 'GIB', bgHex: '#047857', textHex: '#ffffff', initials: 'GIB', logoUrl: '/bank-logos/global.svg', isWide: true };
const UNION_INFO: BankBrandInfo = { domain: 'unionbank.com.bd', shortCode: 'UNION', bgHex: '#0e7490', textHex: '#ffffff', initials: 'UNION', logoUrl: '/bank-logos/union.png', isWide: false };
const SBAC_INFO: BankBrandInfo = { domain: 'sbacbank.com', shortCode: 'SBAC', bgHex: '#1d4ed8', textHex: '#ffffff', initials: 'SBAC', logoUrl: '/bank-logos/sbac.svg', isWide: false };
const PADMA_INFO: BankBrandInfo = { domain: 'padmabankbd.com', shortCode: 'PDB', bgHex: '#db2777', textHex: '#ffffff', initials: 'PDB', logoUrl: '/bank-logos/padma.svg', isWide: false };
const BENGAL_INFO: BankBrandInfo = { domain: 'bgcb.com.bd', shortCode: 'BCBL', bgHex: '#b45309', textHex: '#ffffff', initials: 'BCBL', logoUrl: '/bank-logos/bengal.png', isWide: false };
const CITIZENS_INFO: BankBrandInfo = { domain: 'citizensbankbd.com', shortCode: 'CZB', bgHex: '#047857', textHex: '#ffffff', initials: 'CZB', logoUrl: '/bank-logos/citizens.png', isWide: true };
const COMMUNITY_INFO: BankBrandInfo = { domain: 'communitybankbd.com', shortCode: 'CBB', bgHex: '#1e3a8a', textHex: '#ffffff', initials: 'CBB', logoUrl: '/bank-logos/community.png', isWide: true };
const HO_INFO: BankBrandInfo = { domain: 'polycables.com.bd', shortCode: 'H/O', bgHex: '#475569', textHex: '#ffffff', initials: 'H/O', svgIcon: HO_SVG };

export const BANK_BRAND_MAP: Record<string, BankBrandInfo> = {
  'pubali bank plc': PUBALI_INFO,
  'pubali bank': PUBALI_INFO,
  'pubali': PUBALI_INFO,
  'pbl': PUBALI_INFO,
  'dutch-bangla bank plc': DBBL_INFO,
  'dutch-bangla bank': DBBL_INFO,
  'dutch bangla bank': DBBL_INFO,
  'dutch bangla': DBBL_INFO,
  'dbbl': DBBL_INFO,
  'islami bank bangladesh plc': IBBL_INFO,
  'islami bank bangladesh': IBBL_INFO,
  'islami bank': IBBL_INFO,
  'ibbl': IBBL_INFO,
  'sonali bank plc': SONALI_INFO,
  'sonali bank': SONALI_INFO,
  'sonali': SONALI_INFO,
  'sbl': SONALI_INFO,
  'brac bank plc': BRAC_INFO,
  'brac bank': BRAC_INFO,
  'brac': BRAC_INFO,
  'bbl': BRAC_INFO,
  'the city bank plc': CITY_INFO,
  'city bank plc': CITY_INFO,
  'city bank': CITY_INFO,
  'cbl': CITY_INFO,
  'eastern bank plc': EBL_INFO,
  'eastern bank': EBL_INFO,
  'ebl': EBL_INFO,
  'standard chartered bank': SCB_INFO,
  'standard chartered': SCB_INFO,
  'scb': SCB_INFO,
  'hsbc': HSBC_INFO,
  'bank asia plc': BANK_ASIA_INFO,
  'bank asia': BANK_ASIA_INFO,
  'asia': BANK_ASIA_INFO,
  'uttara bank plc': UTTARA_INFO,
  'uttara bank': UTTARA_INFO,
  'uttara': UTTARA_INFO,
  'ubl': UTTARA_INFO,
  'janata bank plc': JANATA_INFO,
  'janata bank': JANATA_INFO,
  'janata': JANATA_INFO,
  'jbl': JANATA_INFO,
  'agrani bank plc': AGRANI_INFO,
  'agrani bank': AGRANI_INFO,
  'agrani': AGRANI_INFO,
  'abl': AGRANI_INFO,
  'rupali bank plc': RUPALI_INFO,
  'rupali bank': RUPALI_INFO,
  'rupali': RUPALI_INFO,
  'rbl': RUPALI_INFO,
  'prime bank plc': PRIME_INFO,
  'prime bank': PRIME_INFO,
  'prime': PRIME_INFO,
  'united commercial bank plc': UCB_INFO,
  'united commercial bank': UCB_INFO,
  'ucb': UCB_INFO,
  'mutual trust bank plc': MTB_INFO,
  'mutual trust bank': MTB_INFO,
  'mtb': MTB_INFO,
  'standard bank plc': STANDARD_INFO,
  'standard bank': STANDARD_INFO,
  'stbl': STANDARD_INFO,
  'mercantile bank plc': MERCANTILE_INFO,
  'mercantile bank': MERCANTILE_INFO,
  'mercantile': MERCANTILE_INFO,
  'mbl': MERCANTILE_INFO,
  'ncc bank plc': NCC_INFO,
  'ncc bank': NCC_INFO,
  'nccb': NCC_INFO,
  'ncc': NCC_INFO,
  'southeast bank plc': SOUTHEAST_INFO,
  'southeast bank': SOUTHEAST_INFO,
  'southeast': SOUTHEAST_INFO,
  'sebl': SOUTHEAST_INFO,
  'al-arafah islami bank plc': ALARAFAH_INFO,
  'al-arafah islami bank': ALARAFAH_INFO,
  'al-arafah': ALARAFAH_INFO,
  'aibl': ALARAFAH_INFO,
  'first security islami bank plc': FSIBL_INFO,
  'first security islami bank': FSIBL_INFO,
  'first security': FSIBL_INFO,
  'fsibl': FSIBL_INFO,
  'social islami bank plc': SIBL_INFO,
  'social islami bank': SIBL_INFO,
  'social islami': SIBL_INFO,
  'sibl': SIBL_INFO,
  'ific bank plc': IFIC_INFO,
  'ific bank': IFIC_INFO,
  'ific': IFIC_INFO,
  'dhaka bank plc': DHAKA_INFO,
  'dhaka bank': DHAKA_INFO,
  'dbl': DHAKA_INFO,
  'ab bank plc': AB_INFO,
  'ab bank': AB_INFO,
  'abbl': AB_INFO,
  'exim bank plc': EXIM_INFO,
  'exim bank': EXIM_INFO,
  'exim': EXIM_INFO,
  'shahjalal islami bank plc': SJIBL_INFO,
  'shahjalal islami bank': SJIBL_INFO,
  'shahjalal islami': SJIBL_INFO,
  'sjibl': SJIBL_INFO,
  'national bank plc': NATIONAL_INFO,
  'national bank': NATIONAL_INFO,
  'nbl': NATIONAL_INFO,
  'one bank plc': ONE_INFO,
  'one bank': ONE_INFO,
  'obl': ONE_INFO,
  'jamuna bank plc': JAMUNA_INFO,
  'jamuna bank': JAMUNA_INFO,
  'jamuna': JAMUNA_INFO,
  'trust bank plc': TRUST_INFO,
  'trust bank': TRUST_INFO,
  'tbl': TRUST_INFO,
  'midland bank plc': MIDLAND_INFO,
  'midland bank': MIDLAND_INFO,
  'midland': MIDLAND_INFO,
  'mdb': MIDLAND_INFO,
  'meghna bank plc': MEGHNA_INFO,
  'meghna bank': MEGHNA_INFO,
  'meghna': MEGHNA_INFO,
  'mgbl': MEGHNA_INFO,
  'modhumoti bank plc': MODHUMOTI_INFO,
  'modhumoti bank': MODHUMOTI_INFO,
  'modhumoti': MODHUMOTI_INFO,
  'mdbl': MODHUMOTI_INFO,
  'nrbc bank plc': NRBC_INFO,
  'nrbc bank': NRBC_INFO,
  'nrb commercial bank': NRBC_INFO,
  'nrbc': NRBC_INFO,
  'nrb bank plc': NRB_INFO,
  'nrb bank': NRB_INFO,
  'nrbb': NRB_INFO,
  'lankabangla finance': LANKA_INFO,
  'lankabangla': LANKA_INFO,
  'lbf': LANKA_INFO,
  'shimanto bank plc': SHIMANTO_INFO,
  'shimanto bank': SHIMANTO_INFO,
  'shimanto': SHIMANTO_INFO,
  'global islami bank plc': GLOBAL_INFO,
  'global islami bank': GLOBAL_INFO,
  'global islami': GLOBAL_INFO,
  'gib': GLOBAL_INFO,
  'union bank plc': UNION_INFO,
  'union bank': UNION_INFO,
  'union': UNION_INFO,
  'sbac bank plc': SBAC_INFO,
  'sbac bank': SBAC_INFO,
  'sbac': SBAC_INFO,
  'padma bank plc': PADMA_INFO,
  'padma bank': PADMA_INFO,
  'padma': PADMA_INFO,
  'pdb': PADMA_INFO,
  'bengal commercial bank plc': BENGAL_INFO,
  'bengal commercial bank': BENGAL_INFO,
  'bengal commercial': BENGAL_INFO,
  'bcbl': BENGAL_INFO,
  'citizens bank plc': CITIZENS_INFO,
  'citizens bank': CITIZENS_INFO,
  'citizens': CITIZENS_INFO,
  'czb': CITIZENS_INFO,
  'community bank bangladesh plc': COMMUNITY_INFO,
  'community bank bangladesh': COMMUNITY_INFO,
  'community bank': COMMUNITY_INFO,
  'cbb': COMMUNITY_INFO,
  'h/o': HO_INFO,
  'head office': HO_INFO,
  'head office (h/o)': HO_INFO
};

const SORTED_BANK_KEYS = Object.keys(BANK_BRAND_MAP).sort((a, b) => b.length - a.length);

const getBankBrand = (bankName?: string): BankBrandInfo => {
  const raw = (bankName || '').trim().toLowerCase();
  const stripped = raw.split('(')[0].trim();
  const candidates = [raw, stripped].filter(Boolean);
  for (const key of candidates) {
    if (BANK_BRAND_MAP[key]) return BANK_BRAND_MAP[key];
  }
  for (const key of candidates) {
    const containedKey = SORTED_BANK_KEYS.find((k) => key.includes(k));
    if (containedKey) return BANK_BRAND_MAP[containedKey];
  }
  for (const key of candidates) {
    if (key.length >= 3 && key !== 'bank' && key !== 'plc' && key !== 'ltd') {
      const reverseKey = SORTED_BANK_KEYS.find((k) => k.includes(key));
      if (reverseKey) return BANK_BRAND_MAP[reverseKey];
    }
  }
  const words = (bankName || 'BNK').trim().split(/\s+/).filter(Boolean);
  const initials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : (bankName || 'BNK').slice(0, 3).toUpperCase();
  const palette = ['#0e7490', '#1d4ed8', '#047857', '#be123c', '#7c3aed', '#b45309'];
  const hash = (bankName || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const bgHex = palette[hash % palette.length];
  return {
    domain: '',
    shortCode: initials,
    bgHex,
    textHex: '#ffffff',
    initials,
    svgIcon: mkMonogramTile(bgHex, '#f59e0b', `<path d="M9 21 H27 M11 19 V12 L18 7 L25 12 V19" fill="none" stroke="${bgHex}" stroke-width="2" stroke-linecap="round"/><text x="18" y="18" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="6.5" fill="${bgHex}">${initials.slice(0, 3)}</text>`)
  };
};

export const BankLogoBadge: React.FC<{ bankName?: string; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  bankName,
  size = 'md',
  className = ''
}) => {
  const brandData = useMemo(() => getBankBrand(bankName), [bankName]);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [brandData.logoUrl]);

  const squareSizeClasses =
    size === 'sm' ? 'w-6 h-6 text-[9px]' : size === 'lg' ? 'w-10 h-10 text-xs' : 'w-8 h-8 text-[10px]';
  const wideSizeClasses =
    size === 'sm'
      ? 'h-6 w-12 px-1 text-[9px]'
      : size === 'lg'
      ? 'h-10 w-20 px-1.5 text-xs'
      : 'h-8 w-16 px-1 text-[10px]';

  // 1. Official verified bank logo image
  if (brandData.logoUrl && !imgError) {
    return (
      <div
        className={`inline-flex items-center justify-center shrink-0 rounded-md overflow-hidden bg-white border border-slate-200/90 shadow-2xs select-none ${
          brandData.isWide ? wideSizeClasses : `${squareSizeClasses} p-0.5`
        } ${className}`}
        title={bankName}
      >
        <img
          src={brandData.logoUrl}
          alt={bankName || 'Bank Logo'}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  // 2. Crisp white-card vector emblem (e.g., Head Office / custom fallback)
  if (brandData.svgIcon) {
    return (
      <div
        className={`inline-flex items-center justify-center shrink-0 rounded-md overflow-hidden bg-white shadow-sm border border-slate-200/90 select-none ${squareSizeClasses} ${className}`}
        title={bankName}
        dangerouslySetInnerHTML={{ __html: brandData.svgIcon }}
      />
    );
  }

  // 3. Crisp monogram badge
  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 rounded-md font-bold font-mono tracking-tighter shadow-2xs border border-white/20 select-none ${squareSizeClasses} ${className}`}
      style={{ backgroundColor: brandData.bgHex, color: brandData.textHex }}
      title={bankName}
    >
      {brandData.shortCode.slice(0, 4)}
    </div>
  );
};

export const BANK_SHORT_CODE_MAP: Record<string, string> = {
  'h/o': 'H/O',
  'head office': 'H/O',
  'pubali bank plc': 'PBL',
  'pubali bank': 'PBL',
  'dutch-bangla bank plc': 'DBBL',
  'dutch-bangla bank': 'DBBL',
  'dbbl': 'DBBL',
  'islami bank bangladesh plc': 'IBBL',
  'islami bank': 'IBBL',
  'ibbl': 'IBBL',
  'sonali bank plc': 'SBL',
  'sonali bank': 'SBL',
  'brac bank plc': 'BBL',
  'brac bank': 'BBL',
  'eastern bank plc': 'EBL',
  'eastern bank': 'EBL',
  'the city bank plc': 'CBL',
  'city bank': 'CBL',
  'standard chartered bank': 'SCB',
  'standard chartered': 'SCB',
  'bank asia plc': 'ASIA',
  'bank asia': 'ASIA',
  'hsbc': 'HSBC',
  'uttara bank plc': 'UBL',
  'uttara bank': 'UBL',
  'janata bank plc': 'JBL',
  'janata bank': 'JBL',
  'agrani bank plc': 'ABL',
  'agrani bank': 'ABL',
  'rupali bank plc': 'RBL',
  'rupali bank': 'RBL',
  'prime bank plc': 'PRIME',
  'prime bank': 'PRIME',
  'united commercial bank plc': 'UCB',
  'ucb': 'UCB',
  'mutual trust bank plc': 'MTB',
  'mtb': 'MTB',
  'standard bank plc': 'STBL',
  'mercantile bank plc': 'MBL',
  'ncc bank plc': 'NCCB',
  'southeast bank plc': 'SEBL',
  'al-arafah islami bank plc': 'AIBL',
  'first security islami bank plc': 'FSIBL',
  'social islami bank plc': 'SIBL',
  'ific bank plc': 'IFIC',
  'dhaka bank plc': 'DBL',
  'ab bank plc': 'ABBL',
  'exim bank plc': 'EXIM',
  'shahjalal islami bank plc': 'SJIBL',
  'national bank plc': 'NBL',
  'one bank plc': 'OBL',
  'jamuna bank plc': 'JAMUNA',
  'trust bank plc': 'TBL',
  'midland bank plc': 'MDB',
  'meghna bank plc': 'MGBL',
  'modhumoti bank plc': 'MDBL',
  'nrb bank plc': 'NRBB',
  'nrbc bank plc': 'NRBC',
  'lankabangla finance': 'LBF',
  'shimanto bank plc': 'SBL',
  'global islami bank plc': 'GIB',
  'union bank plc': 'UNION',
  'sbac bank plc': 'SBAC',
  'padma bank plc': 'PDB',
  'bengal commercial bank plc': 'BCBL',
  'citizens bank plc': 'CZB',
  'community bank bangladesh plc': 'CBB'
};

export const ACCOUNT_SHORT_CODE_MAP: Record<string, string> = {
  'h/o': 'H/O',
  'head office': 'H/O',
  'padma enterprise': 'P.E',
  'zahid enterprise': 'Z.E',
  'sonjoy enterprise': 'S.E',
  'polycables store': 'P.S',
  'madhupur sales center': 'M.S.C',
  'tangail traders': 'T.T',
  'sonjoy chowhan': 'S.C',
  'm/s rahman & sons': 'R&S'
};

type ShortCodeOverrides = Record<string, string>;

const BANK_SHORT_CODE_STORAGE_KEY = 'polycables_bank_short_code_overrides';
const ACCOUNT_SHORT_CODE_STORAGE_KEY = 'polycables_account_short_code_overrides';
const AUTO_SHORT_CODE_OVERRIDE = '__AUTO__';
let bankShortCodeOverridesCache: ShortCodeOverrides | null = null;
let accountShortCodeOverridesCache: ShortCodeOverrides | null = null;

const getShortCodeKey = (name?: string): string => (name || '').trim().toLowerCase();

const readShortCodeOverrides = (storageKey: string): ShortCodeOverrides => {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => key.trim() && typeof value === 'string' && value.trim()
      ).map(([key, value]) => [key.trim().toLowerCase(), (value as string).trim().toUpperCase()])
    );
  } catch {
    return {};
  }
};

const getBankShortCodeOverrides = (): ShortCodeOverrides => {
  if (!bankShortCodeOverridesCache) {
    bankShortCodeOverridesCache = readShortCodeOverrides(BANK_SHORT_CODE_STORAGE_KEY);
  }
  return bankShortCodeOverridesCache;
};

const getAccountShortCodeOverrides = (): ShortCodeOverrides => {
  if (!accountShortCodeOverridesCache) {
    accountShortCodeOverridesCache = readShortCodeOverrides(ACCOUNT_SHORT_CODE_STORAGE_KEY);
  }
  return accountShortCodeOverridesCache;
};

const saveShortCodeOverrides = (
  kind: 'bank' | 'account',
  overrides: ShortCodeOverrides
): void => {
  const storageKey = kind === 'bank' ? BANK_SHORT_CODE_STORAGE_KEY : ACCOUNT_SHORT_CODE_STORAGE_KEY;
  const normalized = Object.fromEntries(
    Object.entries(overrides).filter(([key, value]) => key.trim() && value.trim())
  );
  localStorage.setItem(storageKey, JSON.stringify(normalized));
  if (kind === 'bank') {
    bankShortCodeOverridesCache = normalized;
  } else {
    accountShortCodeOverridesCache = normalized;
  }
  window.dispatchEvent(new Event('polycables_short_tags_updated'));
};

export function setBankShortCodeOverride(bankName: string, shortCode: string): void {
  const key = getShortCodeKey(bankName);
  if (!key) return;
  const overrides = { ...getBankShortCodeOverrides() };
  if (shortCode.trim()) {
    overrides[key] = shortCode.trim().toUpperCase();
  } else {
    overrides[key] = AUTO_SHORT_CODE_OVERRIDE;
  }
  saveShortCodeOverrides('bank', overrides);
}

export function setAccountShortCodeOverride(accountName: string, shortCode: string): void {
  const key = getShortCodeKey(accountName);
  if (!key) return;
  const overrides = { ...getAccountShortCodeOverrides() };
  if (shortCode.trim()) {
    overrides[key] = shortCode.trim().toUpperCase();
  } else {
    overrides[key] = AUTO_SHORT_CODE_OVERRIDE;
  }
  saveShortCodeOverrides('account', overrides);
}

const renameShortCodeOverride = (
  kind: 'bank' | 'account',
  oldName: string,
  newName: string
): void => {
  const overrides = { ...(kind === 'bank' ? getBankShortCodeOverrides() : getAccountShortCodeOverrides()) };
  const oldKey = getShortCodeKey(oldName);
  const newKey = getShortCodeKey(newName);
  const shortCode = overrides[oldKey];
  if (!shortCode || !newKey) return;
  delete overrides[oldKey];
  overrides[newKey] = shortCode;
  saveShortCodeOverrides(kind, overrides);
};

const clearShortCodeOverride = (kind: 'bank' | 'account', name: string): void => {
  const overrides = { ...(kind === 'bank' ? getBankShortCodeOverrides() : getAccountShortCodeOverrides()) };
  const key = getShortCodeKey(name);
  if (!(key in overrides)) return;
  delete overrides[key];
  saveShortCodeOverrides(kind, overrides);
};

const clearShortCodeOverrides = (kind: 'bank' | 'account'): void => {
  saveShortCodeOverrides(kind, {});
};

export const renameBankShortCodeOverride = (oldName: string, newName: string): void =>
  renameShortCodeOverride('bank', oldName, newName);

export const renameAccountShortCodeOverride = (oldName: string, newName: string): void =>
  renameShortCodeOverride('account', oldName, newName);

export const clearBankShortCodeOverride = (name: string): void =>
  clearShortCodeOverride('bank', name);

export const clearAccountShortCodeOverride = (name: string): void =>
  clearShortCodeOverride('account', name);

export const clearAllBankShortCodeOverrides = (): void => clearShortCodeOverrides('bank');
export const clearAllAccountShortCodeOverrides = (): void => clearShortCodeOverrides('account');

export function getBankShortCode(bankName?: string): string {
  if (!bankName) return '';
  const override = getBankShortCodeOverrides()[getShortCodeKey(bankName)];
  if (override && override !== AUTO_SHORT_CODE_OVERRIDE) return override;
  const clean = bankName.trim().toLowerCase();
  if (BANK_SHORT_CODE_MAP[clean]) {
    return BANK_SHORT_CODE_MAP[clean];
  }
  // Check partial key matches
  for (const [key, code] of Object.entries(BANK_SHORT_CODE_MAP)) {
    if (clean.includes(key) || key.includes(clean)) {
      return code;
    }
  }
  // Generate initials
  const words = bankName.replace(/plc|bank|limited|ltd/gi, '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map((w) => w[0]?.toUpperCase()).join('') + 'B';
  }
  return (bankName.slice(0, 4) || 'BNK').toUpperCase();
}

export function getAccountShortCode(accountName?: string): string {
  if (!accountName) return '';
  const override = getAccountShortCodeOverrides()[getShortCodeKey(accountName)];
  if (override && override !== AUTO_SHORT_CODE_OVERRIDE) return override;
  const clean = accountName.trim().toLowerCase();
  if (ACCOUNT_SHORT_CODE_MAP[clean]) {
    return ACCOUNT_SHORT_CODE_MAP[clean];
  }
  // Check partial key matches
  for (const [key, code] of Object.entries(ACCOUNT_SHORT_CODE_MAP)) {
    if (clean.includes(key) || key.includes(clean)) {
      return code;
    }
  }
  // Generate initials with dots
  const words = accountName.replace(/enterprise|traders|store|sons|&/gi, '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map((w) => w[0]?.toUpperCase()).join('.') + '.';
  }
  const firstWord = accountName.trim().split(/\s+/)[0] || '';
  return firstWord ? `${firstWord[0]?.toUpperCase()}.E` : 'A.C';
}

export function generateDisplayTag(bankName?: string, accountName?: string): string {
  if (!bankName && !accountName) return '';
  const bLow = (bankName || '').trim().toLowerCase();
  const aLow = (accountName || '').trim().toLowerCase();
  if (bLow === 'h/o' || bLow.includes('head office') || aLow === 'h/o' || aLow.includes('head office')) {
    return 'H/O';
  }
  const bCode = getBankShortCode(bankName) || 'PBL';
  const aCode = getAccountShortCode(accountName) || 'P.E';
  return `${bCode} (${aCode})`;
}

export function getBankAndAccountShortTag(
  bankName?: string,
  accountName?: string,
  fallbackTag?: string
): string {
  const hasCustomShortCode =
    Boolean(getBankShortCodeOverrides()[getShortCodeKey(bankName)]) ||
    Boolean(getAccountShortCodeOverrides()[getShortCodeKey(accountName)]);
  if (!hasCustomShortCode && fallbackTag && fallbackTag.trim()) {
    const fbClean = fallbackTag.trim();
    if (fbClean === 'H/O' || fbClean.toLowerCase().includes('head office')) {
      return 'H/O';
    }
    if (/\w+\s*\([^)]+\)/.test(fbClean)) {
      return fbClean;
    }
  }
  if (bankName || accountName) {
    return generateDisplayTag(bankName, accountName);
  }
  return fallbackTag || 'PBL (P.E)';
}

export function resolveFullBankName(text?: string, knownBanks?: string[]): string {
  if (!text) return 'Pubali Bank PLC';
  const cleaned = text.trim();
  if (!cleaned) return 'Pubali Bank PLC';
  const tLow = cleaned.toLowerCase();
  if (tLow === 'h/o' || tLow === 'h.o' || tLow.includes('head office')) return 'H/O';

  const bankCatalog = knownBanks && knownBanks.length > 0 ? knownBanks : defaultBanks;

  // 1. Direct exact match against configured banks
  const exact = bankCatalog.find((b) => b.toLowerCase().trim() === tLow);
  if (exact) return exact;

  // 2. Check known short codes (exact short code or "CODE (ACC)" prefix)
  for (const [key, code] of Object.entries(BANK_SHORT_CODE_MAP)) {
    if (
      tLow === code.toLowerCase() ||
      tLow.startsWith(`${code.toLowerCase()} `) ||
      tLow.startsWith(`${code.toLowerCase()}(`)
    ) {
      const match = bankCatalog.find((b) => b.toLowerCase().includes(key));
      if (match) return match;
    }
  }

  // 3. Check if cleaned is a short alias/code (not already a distinct custom multi-word bank name)
  const isCustomFullBank =
    cleaned.split(/\s+/).length >= 2 ||
    /\b(bank|plc|ltd|limited|co-operative|cooperative|finance|corp)\b/i.test(cleaned);

  if (!isCustomFullBank) {
    if (tLow.includes('pubali') || tLow === 'pbl') {
      return bankCatalog.find((b) => b.toLowerCase().includes('pubali')) || 'Pubali Bank PLC';
    }
    if (tLow.includes('dutch') || tLow === 'dbbl') {
      return bankCatalog.find((b) => b.toLowerCase().includes('dutch')) || 'Dutch-Bangla Bank PLC';
    }
    if (tLow.includes('islami') || tLow === 'ibbl') {
      return bankCatalog.find((b) => b.toLowerCase().includes('islami bank bangladesh')) || 'Islami Bank Bangladesh PLC';
    }
    if (tLow.includes('brac') || tLow === 'bbl') {
      return bankCatalog.find((b) => b.toLowerCase().includes('brac')) || 'BRAC Bank PLC';
    }
    if (tLow.includes('sonali') || tLow === 'sbl') {
      return bankCatalog.find((b) => b.toLowerCase().includes('sonali')) || 'Sonali Bank PLC';
    }
    if (tLow.includes('city') || tLow === 'cbl') {
      return bankCatalog.find((b) => b.toLowerCase().includes('city')) || 'The City Bank PLC';
    }
    if (tLow.includes('eastern') || tLow === 'ebl') {
      return bankCatalog.find((b) => b.toLowerCase().includes('eastern')) || 'Eastern Bank PLC';
    }
  }

  // 4. Fallback to substring match in configured catalog only when short code / non-custom
  if (!isCustomFullBank) {
    const partial = bankCatalog.find((b) => b.toLowerCase().includes(tLow) || tLow.includes(b.toLowerCase()));
    if (partial) return partial;
  }

  return cleaned || 'Pubali Bank PLC';
}

export function resolveFullAccountName(text?: string, knownAccounts?: string[]): string {
  if (!text) return 'Padma Enterprise';
  const cleaned = text.trim();
  if (!cleaned) return 'Padma Enterprise';
  const tLow = cleaned.toLowerCase();
  if (tLow === 'h/o' || tLow === 'h.o' || tLow.includes('head office')) return 'Head Office';

  const accountCatalog = knownAccounts && knownAccounts.length > 0 ? knownAccounts : defaultAccounts;

  // 1. Direct exact match against configured accounts
  const exact = accountCatalog.find((a) => a.toLowerCase().trim() === tLow);
  if (exact) return exact;

  // 2. Extract from parenthesis e.g. "PBL (P.E)" -> "p.e"
  const parenMatch = tLow.match(/\(([^)]+)\)/);
  const tagTarget = parenMatch ? parenMatch[1].trim() : tLow;

  const isCustomFullAccount =
    !parenMatch &&
    (cleaned.split(/\s+/).length >= 2 ||
      /\b(enterprise|traders|store|center|centre|cables|electric|industries|ltd|limited|corp|agency|agencies|brothers|sons)\b/i.test(cleaned));

  if (!isCustomFullAccount) {
    if (tagTarget === 'p.e' || tagTarget === 'pe' || tagTarget.includes('padma')) {
      return accountCatalog.find((a) => a.toLowerCase().includes('padma')) || 'Padma Enterprise';
    }
    if (tagTarget === 'z.e' || tagTarget === 'ze' || tagTarget.includes('zahid')) {
      return accountCatalog.find((a) => a.toLowerCase().includes('zahid')) || 'Zahid Enterprise';
    }
    if (tagTarget === 's.e' || tagTarget === 'se' || tagTarget.includes('sonjoy')) {
      return accountCatalog.find((a) => a.toLowerCase().includes('sonjoy')) || 'Sonjoy Enterprise';
    }
    if (tagTarget === 'p.s' || tagTarget === 'ps' || tagTarget.includes('polycables')) {
      return accountCatalog.find((a) => a.toLowerCase().includes('polycables')) || 'Polycables Store';
    }
    if (tagTarget === 'm.s.c' || tagTarget === 'msc' || tagTarget.includes('madhupur')) {
      return accountCatalog.find((a) => a.toLowerCase().includes('madhupur')) || 'Madhupur Sales Center';
    }
    if (tagTarget === 't.t' || tagTarget === 'tt' || tagTarget.includes('tangail')) {
      return accountCatalog.find((a) => a.toLowerCase().includes('tangail')) || 'Tangail Traders';
    }

    // Substring match only for non-custom short tags
    const partial = accountCatalog.find((a) => a.toLowerCase().includes(tagTarget) || tagTarget.includes(a.toLowerCase()));
    if (partial) return partial;
  }

  return cleaned || 'Padma Enterprise';
}

export function resolveAccountNameFromTag(tag?: string, knownAccounts?: string[]): string {
  if (!tag) return 'Padma Enterprise';
  return resolveFullAccountName(tag, knownAccounts);
}

const INVALID_BANK_OR_ACCOUNT_VALUES = new Set([
  '',
  'null',
  'undefined',
  'n/a',
  'na',
  'none',
  '-',
  '--',
  'select',
  'select bank',
  'select account',
  '[object object]'
]);

function isSingleBankOrAccountStringInvalid(val?: string): boolean {
  if (typeof val !== 'string') return true;
  const clean = val.trim().toLowerCase();
  return !clean || INVALID_BANK_OR_ACCOUNT_VALUES.has(clean);
}

export function isInvalidBankOrAccount(
  bankName?: string,
  accountName?: string,
  _knownBanks?: string[],
  _knownAccounts?: string[]
): boolean {
  if (accountName === undefined) {
    return isSingleBankOrAccountStringInvalid(bankName);
  }
  return isSingleBankOrAccountStringInvalid(bankName) || isSingleBankOrAccountStringInvalid(accountName);
}

export interface BankAndAccountDirectoryProps {
  bankList?: string[];
  accountList?: string[];
  onAddBank?: (name: string) => void;
  onDeleteBank?: (name: string) => void;
  onEditBank?: (oldName: string, newName: string) => void;
  onEditBankShortCode?: (bankName: string, shortCode: string) => void;
  onResetBanks?: () => void;
  onAddAccount?: (name: string) => void;
  onDeleteAccount?: (name: string) => void;
  onEditAccount?: (oldName: string, newName: string) => void;
  onEditAccountShortCode?: (accountName: string, shortCode: string) => void;
  onResetAccounts?: () => void;
  isModal?: boolean;
  onClose?: () => void;
}

export const BankAndAccountDirectory: React.FC<BankAndAccountDirectoryProps> = ({
  bankList = defaultBanks,
  accountList = defaultAccounts,
  onAddBank,
  onDeleteBank,
  onEditBank,
  onEditBankShortCode,
  onResetBanks,
  onAddAccount,
  onDeleteAccount,
  onEditAccount,
  onEditAccountShortCode,
  onResetAccounts,
  isModal = false,
  onClose
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'banks' | 'accounts'>('banks');
  const [bankSearch, setBankSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');

  // Add inputs
  const [newBankInput, setNewBankInput] = useState('');
  const [newAccountInput, setNewAccountInput] = useState('');

  // Edit states
  const [editingBankOld, setEditingBankOld] = useState<string | null>(null);
  const [editingBankText, setEditingBankText] = useState('');
  const [editingBankShortCodeFor, setEditingBankShortCodeFor] = useState<string | null>(null);
  const [editingBankShortCodeText, setEditingBankShortCodeText] = useState('');
  const [editingAccountOld, setEditingAccountOld] = useState<string | null>(null);
  const [editingAccountText, setEditingAccountText] = useState('');
  const [editingAccountShortCodeFor, setEditingAccountShortCodeFor] = useState<string | null>(null);
  const [editingAccountShortCodeText, setEditingAccountShortCodeText] = useState('');

  const filteredBanks = useMemo(() => {
    return bankList.filter((b) => b.toLowerCase().includes(bankSearch.toLowerCase().trim()));
  }, [bankList, bankSearch]);

  const filteredAccounts = useMemo(() => {
    return accountList.filter((a) => a.toLowerCase().includes(accountSearch.toLowerCase().trim()));
  }, [accountList, accountSearch]);

  const handleCreateBank = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newBankInput.trim();
    if (!clean) return;
    if (bankList.some((b) => b.toLowerCase() === clean.toLowerCase())) {
      alert(`Bank "${clean}" already exists in the directory.`);
      return;
    }
    onAddBank?.(clean);
    setNewBankInput('');
  };

  const handleSaveBankEdit = (oldName: string) => {
    const clean = editingBankText.trim();
    if (!clean || clean === oldName) {
      setEditingBankOld(null);
      return;
    }
    onEditBank?.(oldName, clean);
    setEditingBankOld(null);
    setEditingBankText('');
  };

  const handleSaveBankShortCode = (bankName: string) => {
    if (onEditBankShortCode) {
      onEditBankShortCode(bankName, editingBankShortCodeText);
    } else {
      setBankShortCodeOverride(bankName, editingBankShortCodeText);
    }
    setEditingBankShortCodeFor(null);
    setEditingBankShortCodeText('');
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newAccountInput.trim();
    if (!clean) return;
    if (accountList.some((a) => a.toLowerCase() === clean.toLowerCase())) {
      alert(`Account "${clean}" already exists in the directory.`);
      return;
    }
    onAddAccount?.(clean);
    setNewAccountInput('');
  };

  const handleSaveAccountEdit = (oldName: string) => {
    const clean = editingAccountText.trim();
    if (!clean || clean === oldName) {
      setEditingAccountOld(null);
      return;
    }
    onEditAccount?.(oldName, clean);
    setEditingAccountOld(null);
    setEditingAccountText('');
  };

  const handleSaveAccountShortCode = (accountName: string) => {
    if (onEditAccountShortCode) {
      onEditAccountShortCode(accountName, editingAccountShortCodeText);
    } else {
      setAccountShortCodeOverride(accountName, editingAccountShortCodeText);
    }
    setEditingAccountShortCodeFor(null);
    setEditingAccountShortCodeText('');
  };

  const content = (
    <div className="space-y-6 text-white">
      {/* Top Header & Sub-Tab Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/20 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-cyan-500/20 border border-cyan-400/35 text-cyan-300 rounded-xl shadow-xs">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white tracking-tight">
              Bank &amp; Account Directory
            </h2>
            <p className="text-xs text-slate-300 font-medium">
              Manage banks, accounts, and custom short tags (clear a code to use its automatic value)
            </p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center space-x-1.5 bg-[#061520] border border-cyan-500/30 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveSubTab('banks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeSubTab === 'banks'
                ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/50 shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Banks ({bankList.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('accounts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeSubTab === 'accounts'
                ? 'bg-[#0e2d42] text-cyan-200 border border-cyan-400/50 shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Accounts ({accountList.length})</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: BANKS DIRECTORY */}
      {activeSubTab === 'banks' && (
        <div className="space-y-4">
          {/* Add Bank Form */}
          <form
            onSubmit={handleCreateBank}
            className="flex flex-wrap items-center gap-2 p-3 bg-[#0b2334]/80 rounded-xl border border-cyan-500/25"
          >
            <input
              type="text"
              value={newBankInput}
              onChange={(e) => setNewBankInput(e.target.value)}
              placeholder="Enter new Bank Name (e.g. Standard Chartered Bank PLC)..."
              className="flex-1 min-w-[240px] px-3 py-2 text-xs border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-[#061520] text-white placeholder-slate-400"
            />
            {newBankInput.trim() && (
              <span className="text-xs font-mono font-bold px-2.5 py-1.5 bg-emerald-500/20 text-emerald-200 border border-emerald-400/35 rounded-lg">
                Tag Preview: {getBankShortCode(newBankInput)}
              </span>
            )}
            <button
              type="submit"
              disabled={!newBankInput.trim()}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-black rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Bank</span>
            </button>
            {onResetBanks && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Reset banks directory to default bank list?')) {
                    onResetBanks();
                  }
                }}
                className="px-3 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                title="Reset to system defaults"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
            )}
          </form>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-cyan-400/80 absolute left-3 top-2.5" />
            <input
              type="text"
              value={bankSearch}
              onChange={(e) => setBankSearch(e.target.value)}
              placeholder="Search banks by name or short tag..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          {/* Banks Table */}
          <div className="bg-[#071824]/70 rounded-xl border border-cyan-500/25 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse text-slate-200">
              <thead className="bg-[#0c2638] text-cyan-200 font-bold uppercase tracking-wider text-[11px] border-b border-cyan-500/30">
                <tr>
                  <th className="py-2.5 px-3 w-14">#</th>
                  <th className="py-2.5 px-3">Bank Logo</th>
                  <th className="py-2.5 px-3 w-28 text-center">Short Code</th>
                  <th className="py-2.5 px-3 w-40 text-center">Sample Tag (P.E)</th>
                  <th className="py-2.5 px-3 w-28 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15">
                {filteredBanks.map((bank, idx) => {
                  const shortCode = getBankShortCode(bank);
                  const sampleTag = generateDisplayTag(bank, 'Padma Enterprise');
                  const isEditing = editingBankOld === bank;

                  return (
                    <tr key={bank} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-semibold text-white">
                        {isEditing ? (
                          <div className="flex items-center space-x-1.5">
                            <input
                              type="text"
                              value={editingBankText}
                              onChange={(e) => setEditingBankText(e.target.value)}
                              className="px-2 py-1 border border-cyan-400 rounded text-xs w-full bg-[#061520] text-white focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveBankEdit(bank)}
                              className="p-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded cursor-pointer"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingBankOld(null)}
                              className="p-1 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <BankLogoBadge bankName={bank} size="sm" />
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {editingBankShortCodeFor === bank ? (
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="text"
                              aria-label={`Short code for ${bank}`}
                              value={editingBankShortCodeText}
                              onChange={(e) => setEditingBankShortCodeText(e.target.value)}
                              placeholder="Auto"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveBankShortCode(bank);
                                if (e.key === 'Escape') setEditingBankShortCodeFor(null);
                              }}
                              maxLength={12}
                              autoFocus
                              className="w-20 px-1.5 py-0.5 bg-[#061520] text-cyan-200 font-mono font-bold rounded border border-cyan-400/50 text-[11px] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveBankShortCode(bank)}
                              className="p-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded cursor-pointer"
                              title="Save short code"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBankShortCodeFor(bank);
                              setEditingBankShortCodeText(shortCode);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/15 text-cyan-200 font-mono font-bold rounded border border-cyan-400/35 text-[11px] cursor-pointer hover:bg-cyan-500/25"
                            title="Edit bank short code"
                          >
                            {shortCode}
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-block px-2 py-0.5 bg-emerald-500/15 text-emerald-200 font-mono font-bold rounded border border-emerald-400/35 text-[11px]">
                          {sampleTag}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBankOld(bank);
                              setEditingBankText(bank);
                            }}
                            className="p-1.5 text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 rounded transition-colors cursor-pointer"
                            title="Edit Bank Name"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {bank !== 'H/O' && onDeleteBank && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Remove "${bank}" from authorized bank directory?`)) {
                                  onDeleteBank(bank);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 rounded transition-colors cursor-pointer"
                              title="Delete Bank"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ACCOUNTS DIRECTORY */}
      {activeSubTab === 'accounts' && (
        <div className="space-y-4">
          {/* Add Account Form */}
          <form
            onSubmit={handleCreateAccount}
            className="flex flex-wrap items-center gap-2 p-3 bg-[#0b2334]/80 rounded-xl border border-cyan-500/25"
          >
            <input
              type="text"
              value={newAccountInput}
              onChange={(e) => setNewAccountInput(e.target.value)}
              placeholder="Enter new Company Account Name (e.g. M/S Polycables Center)..."
              className="flex-1 min-w-[240px] px-3 py-2 text-xs border border-cyan-500/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-[#061520] text-white placeholder-slate-400"
            />
            {newAccountInput.trim() && (
              <span className="text-xs font-mono font-bold px-2.5 py-1.5 bg-purple-500/20 text-purple-200 border border-purple-400/35 rounded-lg">
                Tag Preview: {getAccountShortCode(newAccountInput)}
              </span>
            )}
            <button
              type="submit"
              disabled={!newAccountInput.trim()}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-black rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Account</span>
            </button>
            {onResetAccounts && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Reset accounts directory to default account list?')) {
                    onResetAccounts();
                  }
                }}
                className="px-3 py-2 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                title="Reset to system defaults"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
            )}
          </form>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-cyan-400/80 absolute left-3 top-2.5" />
            <input
              type="text"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              placeholder="Search accounts by name or tag..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-cyan-500/30 rounded-lg bg-[#061520] text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>

          {/* Accounts Table */}
          <div className="bg-[#071824]/70 rounded-xl border border-cyan-500/25 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse text-slate-200">
              <thead className="bg-[#0c2638] text-cyan-200 font-bold uppercase tracking-wider text-[11px] border-b border-cyan-500/30">
                <tr>
                  <th className="py-2.5 px-3 w-14">#</th>
                  <th className="py-2.5 px-3">Company Account Name</th>
                  <th className="py-2.5 px-3 w-28 text-center">Short Code</th>
                  <th className="py-2.5 px-3 w-40 text-center">Sample Tag (PBL)</th>
                  <th className="py-2.5 px-3 w-28 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/15">
                {filteredAccounts.map((account, idx) => {
                  const shortCode = getAccountShortCode(account);
                  const sampleTag = generateDisplayTag('Pubali Bank PLC', account);
                  const isEditing = editingAccountOld === account;

                  return (
                    <tr key={account} className="hover:bg-cyan-500/[0.06] transition-colors">
                      <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-semibold text-white">
                        {isEditing ? (
                          <div className="flex items-center space-x-1.5">
                            <input
                              type="text"
                              value={editingAccountText}
                              onChange={(e) => setEditingAccountText(e.target.value)}
                              className="px-2 py-1 border border-cyan-400 rounded text-xs w-full bg-[#061520] text-white focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveAccountEdit(account)}
                              className="p-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded cursor-pointer"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAccountOld(null)}
                              className="p-1 bg-[#081b28] hover:bg-[#0e2a3d] text-slate-200 border border-cyan-500/30 rounded cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span>{account}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {editingAccountShortCodeFor === account ? (
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="text"
                              aria-label={`Short code for ${account}`}
                              value={editingAccountShortCodeText}
                              onChange={(e) => setEditingAccountShortCodeText(e.target.value)}
                              placeholder="Auto"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveAccountShortCode(account);
                                if (e.key === 'Escape') setEditingAccountShortCodeFor(null);
                              }}
                              maxLength={12}
                              autoFocus
                              className="w-20 px-1.5 py-0.5 bg-[#061520] text-purple-200 font-mono font-bold rounded border border-purple-400/50 text-[11px] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveAccountShortCode(account)}
                              className="p-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded cursor-pointer"
                              title="Save short code"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAccountShortCodeFor(account);
                              setEditingAccountShortCodeText(shortCode);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-200 font-mono font-bold rounded border border-purple-400/35 text-[11px] cursor-pointer hover:bg-purple-500/30"
                            title="Edit account short code"
                          >
                            {shortCode}
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-block px-2 py-0.5 bg-emerald-500/15 text-emerald-200 font-mono font-bold rounded border border-emerald-400/35 text-[11px]">
                          {sampleTag}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAccountOld(account);
                              setEditingAccountText(account);
                            }}
                            className="p-1.5 text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 rounded transition-colors cursor-pointer"
                            title="Edit Account Name"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {account !== 'H/O' && onDeleteAccount && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Remove "${account}" from account directory?`)) {
                                onDeleteAccount(account);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 rounded transition-colors cursor-pointer"
                              title="Delete Account"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-[110] bg-[#030d14]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
        onClick={onClose}
      >
        <div
          className="bg-[#091e2c]/95 backdrop-blur-2xl rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] border border-cyan-400/35 max-w-4xl w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 relative text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-300 hover:text-white hover:bg-cyan-500/15 rounded-xl transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          {content}
        </div>
      </div>
    );
  }

  return <div className="cyber-glass-card rounded-2xl p-6 text-white">{content}</div>;
};

export default BankAndAccountDirectory;
