/**
 * Safely parse JSON strings with a fallback value on syntax errors or invalid input
 */
export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed !== undefined && parsed !== null ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
