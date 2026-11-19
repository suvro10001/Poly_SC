import React, { useState } from 'react';
import { Plus, Check, BookOpen } from 'lucide-react';
import { Snippet } from '../types';

interface CheatsheetsViewProps {
  onSaveSnippetToVault: (snippet: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

interface CheatsheetCard {
  title: string;
  category: string;
  language: any;
  description: string;
  code: string;
  tags: string[];
}

const CHEATSHEET_RECIPES: CheatsheetCard[] = [
  {
    title: 'Git Essential Aliases & Emergency Fixes',
    category: 'DevOps & Git',
    language: 'bash',
    description: 'Clean up merged branches, undo commits safely, and log one-liners.',
    tags: ['git', 'cli', 'workflow'],
    code: `# Undo last commit but keep changes staged
git reset --soft HEAD~1

# Discard all unstaged changes in working tree
git restore .

# Interactive git log graph
git log --graph --oneline --decorate --all

# Clean up local branches deleted on remote
git fetch -p && git branch -vv | awk '/: gone]/ {print $1}' | xargs git branch -D`,
  },
  {
    title: 'Modern CSS Flexbox & Grid Centering Patterns',
    category: 'CSS & Design',
    language: 'css',
    description: 'The cleanest CSS modern layouts with subgrid and container queries.',
    tags: ['css', 'flexbox', 'grid'],
    code: `/* Ultimate 1-line center */
.center-box {
  display: grid;
  place-items: center;
}

/* Auto-fill responsive grid without media queries */
.auto-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 1.5rem;
}

/* Text truncate with ellipsis */
.truncate-multiline {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}`,
  },
  {
    title: 'SQL Joins Visual Reference Cheatsheet',
    category: 'Database & SQL',
    language: 'sql',
    description: 'Standard JOIN recipes, NULL handling, and COALESCE patterns.',
    tags: ['sql', 'database', 'joins'],
    code: `-- Inner Join: Records that match in both tables
SELECT u.name, o.total_amount
FROM users u
INNER JOIN orders o ON u.id = o.user_id;

-- Left Join: All users with optional orders (handle nulls)
SELECT 
  u.name,
  COALESCE(SUM(o.total_amount), 0) AS lifetime_value
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name;`,
  },
  {
    title: 'Common Regular Expression (Regex) Patterns',
    category: 'JavaScript & Utilities',
    language: 'javascript',
    description: 'Battle-tested regex patterns for emails, URLs, UUIDs, and slugs.',
    tags: ['regex', 'validation', 'javascript'],
    code: `export const REGEX_PATTERNS = {
  // RFC 5322 compliant practical email
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/,

  // Standard UUID v4
  uuidV4: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  // URL with protocol
  url: /^https?:\\/\\/(?:www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b(?:[-a-zA-Z0-9()@:%_\\+.~#?&\\/=]*)$/,

  // URL Slug (lowercase, hyphens)
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
};`,
  },
  {
    title: 'Python List Comprehensions & Dictionary Tricks',
    category: 'Python',
    language: 'python',
    description: 'Idiomatic Python one-liners, group-by with defaultdict, and zip unpacking.',
    tags: ['python', 'tricks', 'data'],
    code: `from collections import defaultdict

# Transpose a 2D matrix
matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
transposed = [list(row) for row in zip(*matrix)]

# Group objects by key in O(N)
items = [('fruit', 'apple'), ('veggie', 'carrot'), ('fruit', 'banana')]
grouped = defaultdict(list)
for category, name in items:
    grouped[category].append(name)

# Invert a dictionary
original = {'a': 1, 'b': 2, 'c': 3}
inverted = {v: k for k, v in original.items()}`,
  },
];

export const CheatsheetsView: React.FC<CheatsheetsViewProps> = ({
  onSaveSnippetToVault,
}) => {
  const [savedIndex, setSavedIndex] = useState<number | null>(null);

  const handleSave = (item: CheatsheetCard, idx: number) => {
    onSaveSnippetToVault({
      title: item.title,
      description: item.description,
      code: item.code,
      language: item.language,
      tags: item.tags,
      folderId: '',
      isFavorite: false,
    });
    setSavedIndex(idx);
    setTimeout(() => setSavedIndex(null), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-indigo-400">
          <BookOpen className="w-5 h-5" />
          <h2 className="text-xl font-bold text-white tracking-tight">Developer Cheatsheets & Recipes</h2>
        </div>
        <p className="text-xs text-slate-400">
          Curated quick-reference cheatsheets across Git, SQL, Regex, CSS, and Python. Click &ldquo;Save to Vault&rdquo; to add any recipe to your personal code collection.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CHEATSHEET_RECIPES.map((item, idx) => (
          <div
            key={idx}
            className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-colors shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-semibold text-indigo-400 tracking-wider">
                  {item.category}
                </span>
                <button
                  onClick={() => handleSave(item, idx)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer transition-colors"
                >
                  {savedIndex === idx ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3" />
                      <span>Save to Vault</span>
                    </>
                  )}
                </button>
              </div>
              <h3 className="text-sm font-bold text-white mb-1">{item.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{item.description}</p>
              <pre className="bg-[#070b13] border border-slate-800/80 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto max-h-48">
                <code>{item.code}</code>
              </pre>
            </div>

            <div className="flex items-center gap-2 pt-2 text-[11px] text-slate-500 font-mono">
              {item.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
