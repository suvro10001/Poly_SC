import { ItemType, QuickSaveItem } from './types';

export const STORAGE_KEY_ITEMS = 'quick_save_items_v1';
export const STORAGE_KEY_DRAFT = 'quick_save_draft_v1';

export function detectContentType(text: string): ItemType {
  const trimmed = text.trim();
  if (!trimmed) return 'text';

  // Link detection
  const urlPattern = /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i;
  if (urlPattern.test(trimmed) || (trimmed.startsWith('http') && !trimmed.includes('\n'))) {
    return 'link';
  }

  // Todo / Checklist detection
  if (
    trimmed.startsWith('[ ]') ||
    trimmed.startsWith('[x]') ||
    trimmed.startsWith('- [ ]') ||
    trimmed.startsWith('- [x]') ||
    (trimmed.split('\n').every(line => line.trim().startsWith('- ') || line.trim().startsWith('* ') || line.trim().startsWith('[ ]') || line.trim().length === 0) && trimmed.includes('\n'))
  ) {
    return 'todo';
  }

  // Code detection
  const codeKeywords = [
    'const ', 'let ', 'var ', 'function ', 'import ', 'export ',
    'class ', 'def ', 'return ', 'console.log', 'public static void',
    'SELECT ', 'INSERT INTO', '<div>', '<script>', 'curl ', 'npm install',
    'pip install', 'git clone', 'docker run'
  ];
  const hasCodeKeywords = codeKeywords.some(keyword => trimmed.includes(keyword));
  const hasBracketsAndSemicolons = (trimmed.includes('{') && trimmed.includes('}')) || (trimmed.includes(';') && trimmed.includes('('));
  if (hasCodeKeywords || (hasBracketsAndSemicolons && trimmed.includes('\n'))) {
    return 'code';
  }

  // Contact / Email detection
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(trimmed)) {
    return 'contact';
  }

  return 'text';
}

export function extractTags(text: string): string[] {
  const hashtagRegex = /#([\w-]+)/g;
  const matches = text.match(hashtagRegex);
  if (!matches) return [];
  return Array.from(new Set(matches.map(m => m.replace('#', '').toLowerCase()))).filter(Boolean);
}

export function extractTitle(text: string): { title: string; body: string } {
  const trimmed = text.trim();
  const lines = trimmed.split('\n');
  if (lines.length === 0 || !trimmed) {
    return { title: 'Untitled Note', body: '' };
  }

  const firstLine = lines[0].replace(/^#+\s*/, '').replace(/^-\s*/, '').trim();
  const title = firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
  const body = lines.slice(1).join('\n').trim();

  return {
    title: title || 'Quick Note',
    body: body || (lines.length === 1 ? '' : trimmed),
  };
}

export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffInSec = Math.floor((now - timestamp) / 1000);

  if (diffInSec < 5) return 'Just now';
  if (diffInSec < 60) return `${diffInSec}s ago`;
  const diffInMin = Math.floor(diffInSec / 60);
  if (diffInMin < 60) return `${diffInMin}m ago`;
  const diffInHours = Math.floor(diffInMin / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  } else {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return Promise.resolve(successful);
    } catch {
      return Promise.resolve(false);
    }
  }
}

export function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const SAMPLE_DATA: QuickSaveItem[] = [
  {
    id: 'sample-1',
    title: 'Welcome to Quick Save',
    content: 'Type anything in the box above and press Cmd+Enter (or Ctrl+Enter) to save instantly.\n\nKey features:\n- Instant autosave of your in-progress drafts\n- Automatic type detection (URLs, Code, Tasks, Notes)\n- #hashtags to automatically organize\n- Quick 1-click clipboard copy\n- Markdown, JSON, and text export',
    type: 'text',
    tags: ['welcome', 'quickstart'],
    pinned: true,
    createdAt: Date.now() - 1000 * 60 * 12,
    updatedAt: Date.now() - 1000 * 60 * 12,
  },
  {
    id: 'sample-2',
    title: 'https://github.com/trending',
    content: 'https://github.com/trending\nCheck the latest trending open source repositories #resources #github',
    type: 'link',
    tags: ['resources', 'github'],
    pinned: false,
    createdAt: Date.now() - 1000 * 60 * 45,
    updatedAt: Date.now() - 1000 * 60 * 45,
  },
  {
    id: 'sample-3',
    title: 'React Quick Hook snippet',
    content: 'const [saved, setSaved] = useState(false);\nuseEffect(() => {\n  localStorage.setItem("key", JSON.stringify(data));\n}, [data]);',
    type: 'code',
    tags: ['code', 'react'],
    pinned: false,
    createdAt: Date.now() - 1000 * 60 * 120,
    updatedAt: Date.now() - 1000 * 60 * 120,
  },
  {
    id: 'sample-4',
    title: 'Release checklist',
    content: '- [x] Verify responsive layout\n- [x] Test clipboard copy\n- [ ] Export notes backup\n- [ ] Clean up temp items #tasks',
    type: 'todo',
    tags: ['tasks'],
    pinned: false,
    completed: false,
    createdAt: Date.now() - 1000 * 60 * 240,
    updatedAt: Date.now() - 1000 * 60 * 240,
  }
];
