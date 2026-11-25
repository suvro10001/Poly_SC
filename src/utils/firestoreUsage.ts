export interface FirestoreUsageEstimate {
  dayUtc: string;
  reads: number;
  writes: number;
  deletes: number;
  updatedAt: string | null;
  persistent: boolean;
}

type UsageKind = 'reads' | 'writes' | 'deletes';

const STORAGE_KEY = 'polycables_firestore_usage_v2';
const listeners = new Set<(estimate: FirestoreUsageEstimate) => void>();

function currentUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyEstimate(persistent: boolean): FirestoreUsageEstimate {
  return {
    dayUtc: currentUtcDay(),
    reads: 0,
    writes: 0,
    deletes: 0,
    updatedAt: null,
    persistent
  };
}

function parseEstimate(value: string | null): FirestoreUsageEstimate | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<FirestoreUsageEstimate>;
    if (
      parsed.dayUtc !== currentUtcDay() ||
      typeof parsed.reads !== 'number' ||
      typeof parsed.writes !== 'number' ||
      typeof parsed.deletes !== 'number'
    ) {
      return null;
    }
    return {
      dayUtc: parsed.dayUtc,
      reads: Math.max(0, Math.floor(parsed.reads)),
      writes: Math.max(0, Math.floor(parsed.writes)),
      deletes: Math.max(0, Math.floor(parsed.deletes)),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      persistent: true
    };
  } catch {
    return null;
  }
}

function loadEstimate(): FirestoreUsageEstimate {
  if (typeof window === 'undefined') return emptyEstimate(false);
  try {
    return parseEstimate(window.localStorage.getItem(STORAGE_KEY)) || emptyEstimate(true);
  } catch {
    return emptyEstimate(false);
  }
}

let estimate = loadEstimate();

function notifyListeners(): void {
  const snapshot = { ...estimate };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error(
        '[Firestore Usage Listener Error]',
        error instanceof Error ? error.name : 'Unknown error'
      );
    }
  });
}

function refreshDay(): void {
  if (estimate.dayUtc === currentUtcDay()) return;
  estimate = emptyEstimate(estimate.persistent);
  notifyListeners();
}

export function getFirestoreUsageEstimate(): FirestoreUsageEstimate {
  refreshDay();
  return { ...estimate };
}

export function subscribeFirestoreUsageEstimate(
  listener: (estimate: FirestoreUsageEstimate) => void
): () => void {
  listeners.add(listener);
  listener(getFirestoreUsageEstimate());
  return () => listeners.delete(listener);
}

export function recordFirestoreUsage(kind: UsageKind, count: number = 1): void {
  if (!Number.isFinite(count) || count <= 0) return;
  refreshDay();
  estimate = {
    ...estimate,
    [kind]: estimate[kind] + Math.floor(count),
    updatedAt: new Date().toISOString()
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(estimate));
      estimate.persistent = true;
    } catch {
      estimate.persistent = false;
    }
  } else {
    estimate.persistent = false;
  }
  notifyListeners();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    estimate = parseEstimate(event.newValue) || emptyEstimate(false);
    notifyListeners();
  });
}
