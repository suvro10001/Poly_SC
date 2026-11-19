export interface RunnerLog {
  type: 'log' | 'info' | 'warn' | 'error' | 'return';
  messages: string[];
  timestamp: string;
}

export interface RunnerResult {
  logs: RunnerLog[];
  executionTimeMs: number;
  error?: string;
  returnValue?: string;
}

/**
 * Strips basic TypeScript syntax so code can execute in browser JS engine
 */
function cleanTypeScriptForExecution(tsCode: string): string {
  let js = tsCode;
  // Remove import/export keywords for local eval
  js = js.replace(/^\s*export\s+(default\s+)?/gm, '');
  js = js.replace(/^\s*import\s+.*?;?\s*$/gm, '');
  // Remove interface and type definitions
  js = js.replace(/(interface|type)\s+[A-Za-z0-9_<>,\s\n={}|&]+;?/g, '');
  // Remove simple function type annotations like ': string', ': void', ': number'
  js = js.replace(/:\s*[A-Za-z0-9_<>\[\]|&\s]+(?=[,)={;])/g, '');
  // Remove 'as <type>' assertions
  js = js.replace(/\s+as\s+[A-Za-z0-9_<>\[\]]+/g, '');
  return js;
}

/**
 * Executes JavaScript/TypeScript code in a sandboxed context and captures all console outputs
 */
export async function executeJavaScriptSnippet(code: string, isTypeScript: boolean): Promise<RunnerResult> {
  const startTime = performance.now();
  const logs: RunnerLog[] = [];

  const stringifyArg = (arg: unknown): string => {
    if (arg === undefined) return 'undefined';
    if (arg === null) return 'null';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  };

  const fakeConsole = {
    log: (...args: unknown[]) => {
      logs.push({
        type: 'log',
        messages: args.map(stringifyArg),
        timestamp: new Date().toLocaleTimeString(),
      });
    },
    info: (...args: unknown[]) => {
      logs.push({
        type: 'info',
        messages: args.map(stringifyArg),
        timestamp: new Date().toLocaleTimeString(),
      });
    },
    warn: (...args: unknown[]) => {
      logs.push({
        type: 'warn',
        messages: args.map(stringifyArg),
        timestamp: new Date().toLocaleTimeString(),
      });
    },
    error: (...args: unknown[]) => {
      logs.push({
        type: 'error',
        messages: args.map(stringifyArg),
        timestamp: new Date().toLocaleTimeString(),
      });
    },
  };

  let runnableCode = code;
  if (isTypeScript) {
    try {
      runnableCode = cleanTypeScriptForExecution(code);
    } catch {
      runnableCode = code;
    }
  }

  try {
    // Construct sandbox function with custom console
    const sandboxFn = new Function('console', `
      "use strict";
      try {
        ${runnableCode}
      } catch (err) {
        throw err;
      }
    `);

    const result = sandboxFn(fakeConsole);
    const endTime = performance.now();

    return {
      logs,
      executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
      returnValue: result !== undefined ? stringifyArg(result) : undefined,
    };
  } catch (err: unknown) {
    const endTime = performance.now();
    const errorMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logs.push({
      type: 'error',
      messages: [errorMsg],
      timestamp: new Date().toLocaleTimeString(),
    });

    return {
      logs,
      executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
      error: errorMsg,
    };
  }
}

/**
 * Validates and formats JSON
 */
export function validateJsonCode(code: string): { valid: boolean; formatted?: string; error?: string } {
  try {
    const parsed = JSON.parse(code);
    return {
      valid: true,
      formatted: JSON.stringify(parsed, null, 2),
    };
  } catch (err: unknown) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid JSON syntax',
    };
  }
}

/**
 * In-memory mock SQL dataset for the query executor
 */
export interface SqlQueryResult {
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
  rowCount: number;
  message?: string;
}

const MOCK_DB = {
  employees: [
    { id: 1, name: 'Alice Walker', title: 'VP Engineering', manager_id: null, department: 'Eng', salary: 185000 },
    { id: 2, name: 'Bob Smith', title: 'Staff Architect', manager_id: 1, department: 'Eng', salary: 160000 },
    { id: 3, name: 'Claire Zhang', title: 'Senior Backend Engineer', manager_id: 2, department: 'Eng', salary: 142000 },
    { id: 4, name: 'David Miller', title: 'Fullstack Engineer', manager_id: 2, department: 'Eng', salary: 130000 },
    { id: 5, name: 'Elena Rostova', title: 'Principal Designer', manager_id: 1, department: 'Product', salary: 155000 },
  ],
  transactions: [
    { id: 101, customer_id: 42, amount: 1450.00, status: 'completed', created_at: '2026-10-01' },
    { id: 102, customer_id: 42, amount: 280.50, status: 'completed', created_at: '2026-10-04' },
    { id: 103, customer_id: 88, amount: 3900.00, status: 'completed', created_at: '2026-10-05' },
    { id: 104, customer_id: 19, amount: 120.00, status: 'pending', created_at: '2026-10-09' },
    { id: 105, customer_id: 42, amount: 890.00, status: 'completed', created_at: '2026-10-10' },
  ],
};

export function executeSqlSnippet(sqlQuery: string): SqlQueryResult {
  const query = sqlQuery.trim().toLowerCase();

  if (query.includes('employees')) {
    const data = MOCK_DB.employees;
    return {
      columns: ['id', 'name', 'title', 'manager_id', 'department', 'salary'],
      rows: data,
      rowCount: data.length,
      message: `Executed query against table 'employees'. (${data.length} records returned)`,
    };
  }

  if (query.includes('transactions')) {
    const data = MOCK_DB.transactions;
    return {
      columns: ['id', 'customer_id', 'amount', 'status', 'created_at'],
      rows: data,
      rowCount: data.length,
      message: `Executed query against table 'transactions'. (${data.length} records returned)`,
    };
  }

  // Generic fallback query response
  return {
    columns: ['id', 'name', 'status', 'created_at'],
    rows: [
      { id: 1, name: 'Production Pipeline Alpha', status: 'active', created_at: '2026-10-11' },
      { id: 2, name: 'Analytics Worker Node', status: 'idle', created_at: '2026-10-10' },
      { id: 3, name: 'Cache Invalidation Daemon', status: 'active', created_at: '2026-10-09' },
    ],
    rowCount: 3,
    message: 'Simulated query executed successfully against in-memory PolyCode database.',
  };
}
