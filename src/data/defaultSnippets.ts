import { Folder, Snippet } from '../types';

export const DEFAULT_FOLDERS: Folder[] = [
  { id: 'frontend', name: 'Frontend & UI', color: '#6366f1' },
  { id: 'backend', name: 'Backend & APIs', color: '#10b981' },
  { id: 'algorithms', name: 'Algorithms & Data', color: '#f59e0b' },
  { id: 'database', name: 'SQL & Database', color: '#ec4899' },
  { id: 'devops', name: 'DevOps & Shell', color: '#06b6d4' },
];

export const DEFAULT_SNIPPETS: Snippet[] = [
  {
    id: 'snip-1',
    title: 'useDebounce Custom Hook',
    description: 'Delays updating state until a specified timeout has elapsed since the last change.',
    language: 'typescript',
    tags: ['react', 'hooks', 'typescript', 'performance'],
    folderId: 'frontend',
    isFavorite: true,
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 2,
    code: `import { useState, useEffect } from 'react';

/**
 * Hook that debounces any fast-changing value
 * @param value The raw input value
 * @param delay Milliseconds to debounce
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Example usage:
// const searchQuery = useDebounce(inputString, 400);`,
    history: [
      {
        id: 'h1',
        timestamp: Date.now() - 86400000 * 5,
        code: `// Initial commit of useDebounce hook`,
        note: 'Initial draft',
      },
    ],
  },
  {
    id: 'snip-2',
    title: 'TypeScript DeepPartial & Prettify Helpers',
    description: 'Essential type-level utilities for nested config objects and clean hover previews.',
    language: 'typescript',
    tags: ['typescript', 'generics', 'utility-types'],
    folderId: 'frontend',
    isFavorite: true,
    createdAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 86400000 * 1,
    code: `/**
 * Flattens intersection types for cleaner tooltips in VS Code
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Recursively marks all nested object properties as optional
 */
export type DeepPartial<T> = T extends Function
  ? T
  : T extends Array<infer U>
  ? _DeepPartialArray<U>
  : T extends object
  ? _DeepPartialObject<T>
  : T | undefined;

type _DeepPartialArray<T> = Array<DeepPartial<T>>;
type _DeepPartialObject<T> = { [P in keyof T]?: DeepPartial<T[P]> };

/**
 * Enforces that at least one of the keys in Keys must be present
 */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> &
      Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];`,
  },
  {
    id: 'snip-3',
    title: 'Exponential Backoff Retry Decorator',
    description: 'Python retry wrapper with jitter for external HTTP APIs and rate-limited endpoints.',
    language: 'python',
    tags: ['python', 'networking', 'async', 'resilience'],
    folderId: 'backend',
    isFavorite: true,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 1,
    code: `import time
import random
import functools
import logging

logger = logging.getLogger(__name__)

def retry_with_backoff(
    retries: int = 4,
    initial_delay: float = 0.5,
    backoff_factor: float = 2.0,
    jitter: bool = True
):
    """Retries a callable upon unhandled exceptions with exponential backoff."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            delay = initial_delay
            for attempt in range(1, retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as exc:
                    if attempt == retries:
                        logger.error(f"Execution failed after {retries} attempts: {exc}")
                        raise
                    
                    sleep_time = delay * (1 + random.random() * 0.2) if jitter else delay
                    logger.warning(f"Attempt {attempt} failed ({exc}). Retrying in {sleep_time:.2f}s...")
                    time.sleep(sleep_time)
                    delay *= backoff_factor
        return wrapper
    return decorator`,
  },
  {
    id: 'snip-4',
    title: 'High-Performance LRU Cache in JavaScript',
    description: 'O(1) Get and Put operations using native JavaScript Map preserving insertion ordering.',
    language: 'javascript',
    tags: ['javascript', 'algorithms', 'cache', 'data-structures'],
    folderId: 'algorithms',
    isFavorite: false,
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000 * 2,
    code: `class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    // Re-insert to refresh recency order
    const val = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  put(key, val) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Delete oldest item (first key in Map iterator)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, val);
  }

  dump() {
    return Array.from(this.cache.entries());
  }
}

// Verification runner
const lru = new LRUCache(3);
lru.put('token_a', 101);
lru.put('token_b', 202);
lru.put('token_c', 303);
console.log('Accessed token_a:', lru.get('token_a'));
lru.put('token_d', 404); // Evicts token_b
console.log('Current LRU state:', lru.dump());`,
  },
  {
    id: 'snip-5',
    title: 'Recursive CTE for Organization Hierarchy',
    description: 'Traverses nested manager-report tree to compute depths and total team reporting rollups.',
    language: 'sql',
    tags: ['sql', 'postgres', 'cte', 'queries'],
    folderId: 'database',
    isFavorite: true,
    createdAt: Date.now() - 86400000 * 6,
    updatedAt: Date.now() - 86400000 * 3,
    code: `WITH RECURSIVE OrgHierarchy AS (
  -- Base step: Top-level executives (no manager)
  SELECT 
    id,
    name,
    manager_id,
    title,
    1 AS depth_level,
    ARRAY[name::text] AS reporting_chain
  FROM employees
  WHERE manager_id IS NULL

  UNION ALL

  -- Recursive step: Team members reporting to ancestors
  SELECT 
    e.id,
    e.name,
    e.manager_id,
    e.title,
    oh.depth_level + 1,
    array_append(oh.reporting_chain, e.name::text)
  FROM employees e
  INNER JOIN OrgHierarchy oh ON e.manager_id = oh.id
)
SELECT 
  id,
  name,
  title,
  depth_level,
  array_to_string(reporting_chain, ' -> ') AS path
FROM OrgHierarchy
ORDER BY depth_level, name;`,
  },
  {
    id: 'snip-6',
    title: 'Bash Safe Script Header & Cleanup Trap',
    description: 'Production bash wrapper with strict error flags, lock files, and guaranteed cleanup on exit.',
    language: 'bash',
    tags: ['bash', 'devops', 'scripts', 'automation'],
    folderId: 'devops',
    isFavorite: false,
    createdAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 86400000 * 1,
    code: `#!/usr/bin/env bash
set -Eeuo pipefail

LOCK_FILE="/tmp/polycode_task_\$\$.lock"

cleanup() {
  local exit_code=$?
  rm -f "\${LOCK_FILE}"
  if [ \${exit_code} -ne 0 ]; then
    echo "[-] Job failed with exit code: \${exit_code}" >&2
  else
    echo "[+] Job completed successfully."
  fi
  exit \${exit_code}
}

trap cleanup EXIT INT TERM

touch "\${LOCK_FILE}"
echo "[*] Initialized task PID $$ (Lock: \${LOCK_FILE})"

# Main execution logic below
echo "[*] Step 1: Performing health checks..."
echo "[*] Step 2: Syncing build assets..."`,
  },
  {
    id: 'snip-7',
    title: 'Live Interactive Canvas / CSS Particle Card',
    description: 'Self-contained HTML5 and CSS component ready to render live in the PolyCode preview sandbox.',
    language: 'html',
    tags: ['html', 'css', 'interactive', 'components'],
    folderId: 'frontend',
    isFavorite: true,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 1,
    code: `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 30%, #1e1b4b, #09090b);
      color: #e2e8f0;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    h2 { font-size: 1.5rem; margin-bottom: 8px; color: #a5b4fc; }
    p { font-size: 0.95rem; color: #94a3b8; line-height: 1.5; margin-bottom: 20px; }
    button {
      background: #6366f1;
      color: white;
      border: none;
      padding: 10px 22px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover { background: #4f46e5; transform: translateY(-1px); }
  </style>
</head>
<body>
  <div class="card">
    <h2>Poly Sandbox Preview</h2>
    <p>Live sandbox executing code within PolyCode. Modify the HTML/CSS above and hit Run to preview immediately.</p>
    <button onclick="alert('PolyCode Live Sandbox Active!')">Trigger Action</button>
  </div>
</body>
</html>`,
  },
  {
    id: 'snip-8',
    title: 'Go Concurrent Worker Pool with Channels',
    description: 'Idiomatic Go pattern for processing bounded concurrent tasks with error contexts.',
    language: 'go',
    tags: ['go', 'concurrency', 'channels', 'goroutines'],
    folderId: 'backend',
    isFavorite: false,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 1,
    code: `package main

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Job struct {
	ID    int
	Input string
}

type Result struct {
	JobID  int
	Output string
	Err    error
}

func Worker(ctx context.Context, id int, jobs <-chan Job, results chan<- Result, wg *sync.WaitGroup) {
	defer wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case job, ok := <-jobs:
			if !ok {
				return
			}
			// Process job
			time.Sleep(50 * time.Millisecond)
			results <- Result{
				JobID:  job.ID,
				Output: fmt.Sprintf("Worker %d completed job %d", id, job.ID),
			}
		}
	}
}`,
  },
];
