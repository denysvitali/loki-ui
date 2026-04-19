import { useEffect, useRef, useState } from 'react';
import type { Credentials, Datasource, Stream } from '@/lib/loki';

export type TailStatus = 'idle' | 'connecting' | 'open' | 'error' | 'closed';

export interface TailState {
  status: TailStatus;
  /** Merged streams (most recent first). Capped at `capacity` entries. */
  streams: Stream[];
  droppedEntries: number;
  error?: string;
}

export interface UseTailOptions {
  ds: Datasource;
  creds: Credentials;
  query: string;
  enabled: boolean;
  /** Max entries to retain in the in-memory buffer. Default 5000. */
  capacity?: number;
}

interface TailMessage {
  streams?: Stream[];
  dropped_entries?: Array<{
    labels: Record<string, string>;
    timestamp: string;
  }>;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Live-tail WebSocket hook. See PLAN §4.12 and §3.3 for the auth matrix.
 *
 * Browsers cannot set custom headers on WebSockets, so:
 *   - none auth: works directly
 *   - X-Scope-OrgID only: passed as ?orgId=<tenant>
 *   - basic/bearer: requires `ds.cookieAuth` — the user has declared
 *     their proxy sets an auth cookie upstream of Loki
 *
 * If neither path is viable we don't even open the socket; callers should
 * gate via `canTail(ds)` and disable the toggle with an explanatory tooltip.
 */
export function useTail({
  ds,
  query,
  enabled,
  capacity = 5000,
}: UseTailOptions): TailState {
  const [state, setState] = useState<TailState>({
    status: 'idle',
    streams: [],
    droppedEntries: 0,
  });
  const bufferRef = useRef<Stream[]>([]);
  const droppedRef = useRef(0);

  useEffect(() => {
    if (!enabled || !query.trim() || !canTail(ds)) {
      setState((s) => ({ ...s, status: 'idle' }));
      return;
    }

    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    bufferRef.current = [];
    droppedRef.current = 0;
    setState({ status: 'connecting', streams: [], droppedEntries: 0 });

    const url = buildTailUrl(ds, query);

    const connect = () => {
      if (closed) return;
      setState((s) => ({ ...s, status: 'connecting' }));
      try {
        ws = new WebSocket(url);
      } catch (err) {
        setState({
          status: 'error',
          streams: bufferRef.current,
          droppedEntries: droppedRef.current,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      ws.onopen = () => {
        attempt = 0;
        setState((s) => ({ ...s, status: 'open' }));
      };
      ws.onmessage = (ev) => {
        let msg: TailMessage;
        try {
          msg = JSON.parse(ev.data) as TailMessage;
        } catch {
          return;
        }
        if (msg.streams?.length) {
          bufferRef.current = mergePrepend(
            msg.streams,
            bufferRef.current,
            capacity,
          );
        }
        if (msg.dropped_entries?.length) {
          droppedRef.current += msg.dropped_entries.length;
        }
        setState({
          status: 'open',
          streams: bufferRef.current,
          droppedEntries: droppedRef.current,
        });
      };
      ws.onerror = () => {
        setState((s) => ({
          ...s,
          status: 'error',
          error: 'websocket error',
        }));
      };
      ws.onclose = (ev) => {
        if (closed) return;
        if (ev.code === 1008 || ev.code === 1002) {
          // Protocol / policy error — don't reconnect
          setState((s) => ({ ...s, status: 'closed' }));
          return;
        }
        // Exponential backoff
        attempt++;
        const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** Math.min(attempt, 6));
        setState((s) => ({ ...s, status: 'connecting' }));
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000, 'unmount');
    };
  }, [enabled, query, ds.id, ds.url, ds.authType, ds.tenant, ds.cookieAuth, capacity]);

  return state;
}

/** Quickly determines whether live tail is possible with current auth. */
export function canTail(ds: Datasource): boolean {
  if (ds.authType === 'none') return true;
  // X-Scope-OrgID alone (no basic/bearer) can be passed as query param.
  // Otherwise require cookieAuth upstream of the proxy.
  return ds.cookieAuth === true;
}

function buildTailUrl(ds: Datasource, query: string): string {
  const base = ds.url.replace(/\/+$/, '');
  const proto = base.startsWith('https:') ? 'wss:' : 'ws:';
  // Replace scheme (http/https) with ws/wss
  const noScheme = base.replace(/^https?:/, '');
  const p = new URLSearchParams();
  p.set('query', query);
  p.set('limit', '100');
  if (ds.tenant) p.set('orgId', ds.tenant);
  return `${proto}${noScheme}/loki/api/v1/tail?${p.toString()}`;
}

/**
 * Merge new streams (newest first from WS) into the existing buffer, keeping
 * at most `capacity` total entries. We merge same-label streams; otherwise
 * we add a new stream entry.
 */
function mergePrepend(
  incoming: Stream[],
  existing: Stream[],
  capacity: number,
): Stream[] {
  const byKey = new Map<string, Stream>();
  // Incoming goes in first (so the newer entries take precedence in the map).
  for (const s of incoming) byKey.set(keyOf(s.stream), cloneStream(s));
  for (const s of existing) {
    const k = keyOf(s.stream);
    const prev = byKey.get(k);
    if (prev) {
      // Append existing (older) values after incoming (newer) values.
      prev.values = [...prev.values, ...s.values];
    } else {
      byKey.set(k, s);
    }
  }
  const merged = [...byKey.values()];
  // Enforce capacity across all streams by total entry count.
  let total = 0;
  for (const s of merged) total += s.values.length;
  if (total > capacity) {
    let over = total - capacity;
    // Drop oldest (tail) entries.
    for (let i = merged.length - 1; i >= 0 && over > 0; i--) {
      const s = merged[i]!;
      if (s.values.length <= over) {
        over -= s.values.length;
        s.values = [];
      } else {
        s.values = s.values.slice(0, s.values.length - over);
        over = 0;
      }
    }
    // Remove now-empty streams.
    for (let i = merged.length - 1; i >= 0; i--) {
      if (merged[i]!.values.length === 0) merged.splice(i, 1);
    }
  }
  return merged;
}

function keyOf(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

function cloneStream(s: Stream): Stream {
  return { stream: { ...s.stream }, values: [...s.values] };
}
