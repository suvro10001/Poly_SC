import { Folder, Snippet } from '../types';
import { DEFAULT_FOLDERS, DEFAULT_SNIPPETS } from '../data/defaultSnippets';

const STORAGE_KEYS = {
  SNIPPETS: 'polycode_snippets_v1',
  FOLDERS: 'polycode_folders_v1',
  THEME: 'polycode_editor_theme_v1',
  FONT_SIZE: 'polycode_font_size_v1',
};

export function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SNIPPETS);
    if (!raw) {
      saveSnippets(DEFAULT_SNIPPETS);
      return DEFAULT_SNIPPETS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SNIPPETS;
  } catch (err) {
    console.error('Failed to parse saved snippets:', err);
    return DEFAULT_SNIPPETS;
  }
}

export function saveSnippets(snippets: Snippet[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SNIPPETS, JSON.stringify(snippets));
  } catch (err) {
    console.error('Failed to save snippets to localStorage:', err);
  }
}

export function loadFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FOLDERS);
    if (!raw) {
      saveFolders(DEFAULT_FOLDERS);
      return DEFAULT_FOLDERS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_FOLDERS;
  } catch (err) {
    console.error('Failed to parse saved folders:', err);
    return DEFAULT_FOLDERS;
  }
}

export function saveFolders(folders: Folder[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
  } catch (err) {
    console.error('Failed to save folders to localStorage:', err);
  }
}

export function exportVaultToJson(snippets: Snippet[], folders: Folder[]): void {
  const exportPayload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    folders,
    snippets,
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `polycode-vault-backup-${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function downloadSnippetCode(snippet: Snippet, extension: string): void {
  const sanitizedTitle = snippet.title
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 40) || 'snippet';
  
  const blob = new Blob([snippet.code], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.href = url;
  downloadAnchor.download = `${sanitizedTitle}${extension}`;
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(url);
}

export function formatCodeSnippet(code: string, language: string): string {
  if (language === 'json') {
    try {
      const parsed = JSON.parse(code);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return code;
    }
  }

  // General code normalization: remove trailing whitespace and trailing duplicate newlines
  const lines = code.split('\n').map((l) => l.trimEnd());
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n') + '\n';
}
