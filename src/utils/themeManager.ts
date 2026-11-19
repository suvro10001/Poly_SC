import { AppTheme } from '../types';

export type { AppTheme };

export interface ThemeOption {
  id: AppTheme;
  name: string;
  description: string;
  badge: string;
  previewBorder: string;
  previewBg: string;
  previewText: string;
  bodyClass: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'cyber_teal',
    name: 'Cyber Teal',
    description: 'Translucent deep aurora teal cards with crisp cyan and pink glass accents.',
    badge: 'Default',
    previewBorder: 'border-cyan-400/60',
    previewBg: 'bg-[#081822]',
    previewText: 'text-cyan-300',
    bodyClass: 'theme-cyber-teal',
  },
  {
    id: 'glassy_neon',
    name: 'Glassy Neon',
    description: 'High-contrast cyan neon rim glow over dark translucent workspace panels.',
    badge: 'Neon',
    previewBorder: 'border-cyan-300/80',
    previewBg: 'bg-[#06131f]',
    previewText: 'text-cyan-200',
    bodyClass: 'theme-glassy-neon',
  },
  {
    id: 'midnight_slate',
    name: 'Midnight Slate',
    description: 'Clean executive indigo-slate panels tuned for extended daily operations.',
    badge: 'Executive',
    previewBorder: 'border-slate-500/60',
    previewBg: 'bg-[#0b1120]',
    previewText: 'text-sky-300',
    bodyClass: 'theme-midnight-slate',
  },
  {
    id: 'ocean_navy',
    name: 'Ocean Navy',
    description: 'Deep maritime cobalt surface with vibrant sapphire glass highlights.',
    badge: 'Deep Blue',
    previewBorder: 'border-blue-400/60',
    previewBg: 'bg-[#061327]',
    previewText: 'text-blue-300',
    bodyClass: 'theme-ocean-navy',
  },
  {
    id: 'emerald_dark',
    name: 'Emerald Dark',
    description: 'Rich dark pine canvas accented with emerald and mint highlights.',
    badge: 'Emerald',
    previewBorder: 'border-emerald-400/60',
    previewBg: 'bg-[#041612]',
    previewText: 'text-emerald-300',
    bodyClass: 'theme-emerald-dark',
  },
  {
    id: 'classic_dark_slate',
    name: 'Classic Dark Slate',
    description: 'Neutral charcoal dark surfaces with balanced neutral readability.',
    badge: 'Classic',
    previewBorder: 'border-gray-400/60',
    previewBg: 'bg-[#111827]',
    previewText: 'text-slate-200',
    bodyClass: 'theme-classic-dark-slate',
  },
];

const THEME_STORAGE_KEY = 'polycables_theme';
const ALL_THEME_CLASSES = THEME_OPTIONS.map((t) => t.bodyClass);

export function getStoredTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
    if (raw && THEME_OPTIONS.some((t) => t.id === raw)) {
      return raw;
    }
  } catch {}
  return 'cyber_teal';
}

export function applyTheme(themeId: AppTheme): void {
  const option = THEME_OPTIONS.find((t) => t.id === themeId) || THEME_OPTIONS[0];
  try {
    localStorage.setItem(THEME_STORAGE_KEY, option.id);
  } catch {}

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', option.id);
    ALL_THEME_CLASSES.forEach((cls) => document.body.classList.remove(cls));
    document.body.classList.add(option.bodyClass);
  }
}
