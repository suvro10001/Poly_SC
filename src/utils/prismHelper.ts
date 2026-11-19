import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-markup'; // html / xml
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-yaml';

export function highlightCode(code: string, langId: string): string {
  const lang = langId.toLowerCase();
  
  const grammarMap: Record<string, string> = {
    js: 'javascript',
    javascript: 'javascript',
    ts: 'typescript',
    typescript: 'typescript',
    tsx: 'tsx',
    jsx: 'jsx',
    py: 'python',
    python: 'python',
    html: 'markup',
    markup: 'markup',
    css: 'css',
    sql: 'sql',
    rs: 'rust',
    rust: 'rust',
    go: 'go',
    golang: 'go',
    json: 'json',
    sh: 'bash',
    bash: 'bash',
    shell: 'bash',
    md: 'markdown',
    markdown: 'markdown',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    csharp: 'csharp',
    java: 'java',
    yaml: 'yaml',
    yml: 'yaml'
  };

  const targetGrammar = grammarMap[lang] || 'clike';
  const grammar = Prism.languages[targetGrammar] || Prism.languages.javascript || Prism.languages.clike;

  try {
    return Prism.highlight(code, grammar, targetGrammar);
  } catch {
    // Fallback simple escape
    return escapeHtml(code);
  }
}

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
