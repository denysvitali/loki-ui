/**
 * Per-datasource query history ring buffer. Up to 200 entries per
 * datasource, stored in localStorage. See PLAN §4.13.
 */

const MAX_ENTRIES = 200;
const KEY_PREFIX = 'loki-ui:history:';
const CHANGED_EVENT = 'loki-ui:history-changed';

export interface HistoryEntry {
  /** Unix epoch ms of when this query was last run. */
  at: number;
  query: string;
  from: string;
  to: string;
  /** Execution time in ms, if known. */
  execMs?: number;
  /** Bytes processed, if known. */
  bytes?: number;
}

function storageKey(dsId: string): string {
  return `${KEY_PREFIX}${dsId}`;
}

export function readHistory(dsId: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(dsId));
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(dsId: string, entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(storageKey(dsId), JSON.stringify(entries));
  } catch {
    /* quota — silent */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  }
}

export function recordHistory(
  dsId: string,
  entry: Omit<HistoryEntry, 'at'>,
): void {
  if (!entry.query.trim()) return;
  const list = readHistory(dsId);
  // Deduplicate: if the top entry is the same query + range, update time
  // and stats rather than adding a duplicate.
  if (
    list[0] &&
    list[0].query === entry.query &&
    list[0].from === entry.from &&
    list[0].to === entry.to
  ) {
    list[0] = { ...list[0], ...entry, at: Date.now() };
  } else {
    list.unshift({ ...entry, at: Date.now() });
  }
  if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
  writeHistory(dsId, list);
}

export function clearHistory(dsId: string): void {
  try {
    localStorage.removeItem(storageKey(dsId));
  } catch {
    /* noop */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  }
}

export function subscribeHistory(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(KEY_PREFIX)) listener();
  };
  window.addEventListener(CHANGED_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
