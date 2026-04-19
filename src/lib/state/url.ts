/**
 * URL state codec (hash). See PLAN §4.9.
 *
 * List-shaped internally so v0.1 (single pane) upgrades to v0.2 split
 * pane without breakage: `q=a|b` with `|` separator.
 *
 * The URL is the source of truth for ephemeral session state — datasource
 * selection, query, time range, limit, live toggle, wrap toggle, context
 * panel anchor. Scroll position and expanded-row state are NOT URL-encoded.
 */

export interface PaneState {
  datasourceId: string | null;
  query: string;
  from: string;
  to: string;
}

export interface UrlState {
  panes: PaneState[];
  limit: number;
  live: boolean;
  wrap: boolean;
  /** Context panel anchor row id, if open. */
  ctx: string | null;
}

export const DEFAULT_URL_STATE: UrlState = {
  panes: [{ datasourceId: null, query: '', from: 'now-1h', to: 'now' }],
  limit: 1000,
  live: false,
  wrap: true,
  ctx: null,
};

/**
 * Indexed params: pane 0 uses `ds`, `q`, `from`, `to`. Pane 1 uses `ds1`,
 * `q1`, `from1`, `to1` (v0.2). This keeps single-pane URLs clean and
 * avoids picking a separator that could collide with LogQL operators
 * like `|=` inside a query string.
 */
function paneKey(base: 'ds' | 'q' | 'from' | 'to', index: number): string {
  return index === 0 ? base : `${base}${index}`;
}

export function encodeUrlState(state: UrlState): string {
  const p = new URLSearchParams();
  for (let i = 0; i < state.panes.length; i++) {
    const pane = state.panes[i]!;
    p.set(paneKey('ds', i), pane.datasourceId ?? '');
    p.set(paneKey('q', i), pane.query);
    p.set(paneKey('from', i), pane.from);
    p.set(paneKey('to', i), pane.to);
  }
  if (state.limit !== DEFAULT_URL_STATE.limit) p.set('limit', String(state.limit));
  if (state.live) p.set('live', '1');
  if (state.wrap) p.set('wrap', '1');
  if (state.ctx) p.set('ctx', state.ctx);
  return p.toString();
}

export function decodeUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  // Detect presence of at least one pane param at any index.
  const hasAny = [...p.keys()].some((k) => /^(ds|q|from|to)\d*$/.test(k));
  if (!hasAny) return structuredClone(DEFAULT_URL_STATE);

  // Figure out how many panes are present.
  const indices = new Set<number>([0]);
  for (const k of p.keys()) {
    const m = /^(?:ds|q|from|to)(\d+)$/.exec(k);
    if (m) indices.add(Number(m[1]));
  }
  const maxIndex = Math.max(...indices);

  const panes: PaneState[] = [];
  for (let i = 0; i <= maxIndex; i++) {
    const ds = p.get(paneKey('ds', i));
    const q = p.get(paneKey('q', i));
    const from = p.get(paneKey('from', i));
    const to = p.get(paneKey('to', i));
    panes.push({
      datasourceId: ds ? ds : null,
      query: q ?? '',
      from: from || 'now-1h',
      to: to || 'now',
    });
  }

  return {
    panes,
    limit: parseIntSafe(p.get('limit'), DEFAULT_URL_STATE.limit),
    live: p.get('live') === '1',
    wrap: p.get('wrap') === '1',
    ctx: p.get('ctx'),
  };
}

function parseIntSafe(v: string | null, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// ----- hash plumbing ------------------------------------------------------

/** Parse the query portion of the hash (e.g. `#/explore?q=...`). */
export function parseHash(hash: string): { path: string; search: string } {
  // Strip leading '#'
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIdx = h.indexOf('?');
  if (qIdx < 0) return { path: h || '/explore', search: '' };
  return { path: h.slice(0, qIdx) || '/explore', search: h.slice(qIdx + 1) };
}

export function buildHash(path: string, search: string): string {
  return search ? `#${path}?${search}` : `#${path}`;
}
