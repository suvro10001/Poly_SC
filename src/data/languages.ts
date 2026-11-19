import { LanguageMeta } from '../types';

export const LANGUAGES: LanguageMeta[] = [
  {
    id: 'typescript',
    label: 'TypeScript',
    extension: '.ts',
    prismGrammar: 'typescript',
    canExecute: true,
    samplePlaceholder: `// PolyCode TypeScript Snippet
export interface UserProfile {
  id: string;
  username: string;
  roles: string[];
}

export function formatGreeting(user: UserProfile): string {
  return \`Welcome back, \${user.username}!\`;
}
`,
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    extension: '.js',
    prismGrammar: 'javascript',
    canExecute: true,
    samplePlaceholder: `// PolyCode JavaScript Snippet
function calculateFibonacci(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    const c = a + b;
    a = b;
    b = c;
  }
  return b;
}

console.log("Fibonacci(10):", calculateFibonacci(10));
`,
  },
  {
    id: 'python',
    label: 'Python',
    extension: '.py',
    prismGrammar: 'python',
    canExecute: false,
    samplePlaceholder: `# PolyCode Python Snippet
from typing import List, Dict
import time

def retry_operation(attempts: int = 3, delay: float = 1.0):
    def decorator(func):
        def wrapper(*args, **kwargs):
            for attempt in range(1, attempts + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as exc:
                    if attempt == attempts:
                        raise
                    time.sleep(delay)
        return wrapper
    return decorator
`,
  },
  {
    id: 'html',
    label: 'HTML / Web',
    extension: '.html',
    prismGrammar: 'html',
    canExecute: true,
    samplePlaceholder: `<!DOCTYPE html>
<html lang="en">
<head>
  <style>
    body { font-family: sans-serif; display: grid; place-items: center; min-height: 80vh; background: #0f172a; color: #f8fafc; }
    .card { padding: 24px; border-radius: 12px; background: #1e293b; border: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Interactive HTML Component</h2>
    <p>Live sandbox preview powered by PolyCode.</p>
  </div>
</body>
</html>
`,
  },
  {
    id: 'css',
    label: 'CSS',
    extension: '.css',
    prismGrammar: 'css',
    canExecute: false,
    samplePlaceholder: `/* PolyCode CSS Snippet */
@container (min-width: 480px) {
  .responsive-card {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 1.5rem;
    align-items: center;
  }
}

.glow-effect {
  box-shadow: 0 0 25px -5px rgba(99, 102, 241, 0.4);
}
`,
  },
  {
    id: 'sql',
    label: 'SQL',
    extension: '.sql',
    prismGrammar: 'sql',
    canExecute: true,
    samplePlaceholder: `-- PolyCode SQL Snippet
WITH RankedTransactions AS (
  SELECT 
    customer_id,
    amount,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) as rank
  FROM transactions
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT * FROM RankedTransactions WHERE rank <= 3;
`,
  },
  {
    id: 'json',
    label: 'JSON',
    extension: '.json',
    prismGrammar: 'json',
    canExecute: true,
    samplePlaceholder: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ConfigPayload",
  "type": "object",
  "properties": {
    "appName": { "type": "string" },
    "version": { "type": "string" },
    "settings": {
      "type": "object",
      "properties": {
        "maxRetries": { "type": "number", "default": 5 }
      }
    }
  }
}
`,
  },
  {
    id: 'bash',
    label: 'Bash / Shell',
    extension: '.sh',
    prismGrammar: 'bash',
    canExecute: false,
    samplePlaceholder: `#!/usr/bin/env bash
set -euo pipefail

# PolyCode Safe Script Template
trap 'echo "Script interrupted or failed on line $LINENO" >&2' ERR

echo "=== PolyCode Pipeline Starting ==="
`,
  },
  {
    id: 'rust',
    label: 'Rust',
    extension: '.rs',
    prismGrammar: 'rust',
    canExecute: false,
    samplePlaceholder: `// PolyCode Rust Snippet
use std::collections::HashMap;

pub struct Cache<K, V> {
    store: HashMap<K, (V, std::time::Instant)>,
    ttl: std::time::Duration,
}

impl<K: std::hash::Hash + Eq, V> Cache<K, V> {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            store: HashMap::new(),
            ttl: std::time::Duration::from_secs(ttl_secs),
        }
    }
}
`,
  },
  {
    id: 'go',
    label: 'Go',
    extension: '.go',
    prismGrammar: 'go',
    canExecute: false,
    samplePlaceholder: `// PolyCode Go Snippet
package main

import (
	"context"
	"fmt"
	"sync"
)

func workerPool(ctx context.Context, jobs <-chan int, results chan<- int, wg *sync.WaitGroup) {
	defer wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case job, ok := <-jobs:
			if !ok {
				return
			}
			results <- job * job
		}
	}
}
`,
  },
  {
    id: 'markdown',
    label: 'Markdown',
    extension: '.md',
    prismGrammar: 'markdown',
    canExecute: true,
    samplePlaceholder: `# Project Architecture Overview

## Core Principles
1. **Zero latency** state synchronization
2. **Deterministic** fallback behaviors
3. Clean separation of concerns

### Checklist
- [x] Schema migrations
- [x] Authentication flows
- [ ] Production canary release
`,
  },
  {
    id: 'yaml',
    label: 'YAML / CI-CD',
    extension: '.yaml',
    prismGrammar: 'yaml',
    canExecute: false,
    samplePlaceholder: `name: Release Pipeline
on:
  push:
    branches: [main]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
`,
  },
];

export const getLanguageMeta = (id: string): LanguageMeta => {
  return LANGUAGES.find((l) => l.id === id) || LANGUAGES[0];
};
