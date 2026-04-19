import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LokiClient, type QueryResponse, type Stream } from '@/lib/loki';
import { describe as describeError, LokiRequestError } from '@/lib/loki';
import {
  loadCredentials,
  toDatasource,
  type StoredDatasource,
} from '@/lib/state/datasources';
import { useUrlState } from '@/lib/state/useUrlState';
import { resolveRange, browserTimeZone } from '@/lib/time/grammar';
import { recordHistory, type HistoryEntry } from '@/lib/state/history';
import { LabelBrowser } from '@/features/labels/LabelBrowser';
import { canTail, useTail } from '@/features/tail/useTail';
import { ContextPanel, type ContextAnchor } from '@/features/context/ContextPanel';
import { HistoryPopover } from '@/features/history/HistoryPopover';
import { TimeRangePicker } from './TimeRangePicker';
import { LogList } from './LogList';
import { Histogram } from './Histogram';

interface ExploreProps {
  ds: StoredDatasource;
}

export function Explore({ ds }: ExploreProps) {
  const [urlState, updateUrl] = useUrlState();
  const pane = urlState.panes[0] ?? {
    datasourceId: ds.id,
    query: '',
    from: 'now-1h',
    to: 'now',
  };

  useMirrorDatasource(pane.datasourceId, ds.id, (id) =>
    updateUrl((s) => ({
      ...s,
      panes: [{ ...(s.panes[0] ?? pane), datasourceId: id }],
    })),
  );

  const [draftQuery, setDraftQuery] = useState(pane.query);

  const setQuery = (q: string) => {
    setDraftQuery(q);
    updateUrl((s) => ({
      ...s,
      panes: [{ ...(s.panes[0] ?? pane), query: q }],
    }));
  };

  const onRun = (e?: FormEvent) => {
    e?.preventDefault();
    setQuery(draftQuery);
  };

  const onTimeChange = (from: string, to: string) => {
    updateUrl((s) => ({
      ...s,
      panes: [{ ...(s.panes[0] ?? pane), from, to }],
    }));
  };

  const client = useMemo(
    () => new LokiClient(toDatasource(ds), loadCredentials(ds.id, ds.credentialTier)),
    [ds.id, ds.url, ds.authType, ds.tenant, ds.credentialTier],
  );

  // Always resolve a range so the label browser can work before a query runs.
  const liveRange = useMemo(() => {
    try {
      return resolveRange(pane.from, pane.to, new Date(), browserTimeZone());
    } catch {
      return null;
    }
  }, [pane.from, pane.to]);

  const queryRange = useMemo(() => {
    return pane.query.trim() ? liveRange : null;
  }, [pane.query, liveRange]);

  const queryKey = [
    'queryRange',
    ds.id,
    pane.query,
    pane.from,
    pane.to,
    urlState.limit,
  ];

  const result = useQuery<QueryResponse, LokiRequestError>({
    queryKey,
    enabled: Boolean(queryRange && pane.query.trim()),
    queryFn: async ({ signal }) => {
      if (!queryRange) throw new Error('no range');
      return client.queryRange(
        {
          query: pane.query,
          start: queryRange.fromNs,
          end: queryRange.toNs,
          limit: urlState.limit,
          direction: 'backward',
        },
        signal,
      );
    },
  });

  const selector = extractSelector(draftQuery || pane.query);

  const live = urlState.live;
  const tail = useTail({
    ds: toDatasource(ds),
    creds: loadCredentials(ds.id, ds.credentialTier),
    query: pane.query,
    enabled: live && Boolean(pane.query.trim()),
  });

  const [ctxAnchor, setCtxAnchor] = useState<ContextAnchor | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // "Load older" pagination: extra streams are merged below the live result.
  const [olderStreams, setOlderStreams] = useState<Stream[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Reset pagination when the query/range changes.
  const prevRunKeyRef = useRef('');
  useEffect(() => {
    const runKey = `${pane.query}|${pane.from}|${pane.to}|${urlState.limit}`;
    if (prevRunKeyRef.current !== runKey) {
      prevRunKeyRef.current = runKey;
      setOlderStreams([]);
    }
  }, [pane.query, pane.from, pane.to, urlState.limit]);

  // Record successful queries in history.
  useEffect(() => {
    if (!result.isSuccess || !pane.query.trim()) return;
    const stats = result.data.data.stats?.summary;
    recordHistory(ds.id, {
      query: pane.query,
      from: pane.from,
      to: pane.to,
      ...(stats?.execTime != null ? { execMs: stats.execTime * 1000 } : {}),
      ...(stats?.totalBytesProcessed != null
        ? { bytes: stats.totalBytesProcessed }
        : {}),
    });
  }, [
    result.isSuccess,
    result.data,
    ds.id,
    pane.query,
    pane.from,
    pane.to,
  ]);

  const loadOlder = async () => {
    if (
      !result.data ||
      result.data.data.resultType !== 'streams' ||
      !queryRange
    )
      return;
    const streams = [
      ...(result.data.data.result as Stream[]),
      ...olderStreams,
    ];
    let oldest: bigint | null = null;
    for (const s of streams) {
      for (const v of s.values) {
        const t = BigInt(v[0]);
        if (oldest === null || t < oldest) oldest = t;
      }
    }
    if (oldest === null) return;
    setLoadingOlder(true);
    try {
      const res = await client.queryRange({
        query: pane.query,
        start: queryRange.fromNs,
        end: oldest,
        limit: urlState.limit,
        direction: 'backward',
      });
      if (res.data.resultType === 'streams') {
        const more = res.data.result;
        setOlderStreams((prev) => dedupeStreams([...prev, ...more]));
      }
    } catch (err) {
      console.warn('load-older failed', err);
    } finally {
      setLoadingOlder(false);
    }
  };

  const pickHistory = (entry: HistoryEntry, andRun: boolean) => {
    setDraftQuery(entry.query);
    setHistoryOpen(false);
    if (andRun) {
      updateUrl((s) => ({
        ...s,
        panes: [
          {
            ...(s.panes[0] ?? pane),
            query: entry.query,
            from: entry.from,
            to: entry.to,
          },
        ],
      }));
    }
  };

  const handleInsertLabel = (
    label: string,
    value: string,
    op: '=' | '!=' | '=~' | '!~',
  ) => {
    const next = insertLabelInSelector(draftQuery || pane.query, label, value, op);
    setQuery(next);
  };

  const handleAddLineFilter = (
    op: '|=' | '!=' | '|~' | '!~',
    text: string,
  ) => {
    const trimmed = text.trim();
    const quoted =
      trimmed.startsWith('"') || trimmed.startsWith('`')
        ? trimmed
        : JSON.stringify(trimmed);
    const clause = `${op} ${quoted}`;
    const base = draftQuery || pane.query || selector || '{}';
    const next = `${base.trim()} ${clause}`;
    setQuery(next);
  };

  return (
    <div className="h-full flex min-h-0">
      <aside
        className="w-[300px] shrink-0 border-r border-border bg-card hidden md:flex flex-col min-h-0"
        aria-label="Label browser"
      >
        {liveRange ? (
          <LabelBrowser
            ds={ds}
            selector={selector}
            fromNs={liveRange.fromNs}
            toNs={liveRange.toNs}
            onInsertLabel={handleInsertLabel}
            onAddLineFilter={handleAddLineFilter}
          />
        ) : (
          <div className="p-3 text-xs text-subtle-foreground">
            Invalid time range.
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <form
          onSubmit={onRun}
          className="relative border-b border-border bg-card/40 p-3 space-y-2 flex-shrink-0"
        >
          <textarea
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onRun();
                return;
              }
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'h') {
                e.preventDefault();
                setHistoryOpen(true);
                return;
              }
              if (
                e.key === 'ArrowUp' &&
                (e.currentTarget.value === '' || !e.currentTarget.value.trim())
              ) {
                e.preventDefault();
                setHistoryOpen(true);
              }
            }}
            placeholder='{app="foo"} |= "error"'
            rows={2}
            spellCheck={false}
            className="w-full px-3 py-2 rounded-md bg-background border border-input font-mono text-sm text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none resize-y"
          />
          {historyOpen && (
            <HistoryPopover
              dsId={ds.id}
              onPick={pickHistory}
              onClose={() => setHistoryOpen(false)}
            />
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <TimeRangePicker
              from={pane.from}
              to={pane.to}
              onChange={onTimeChange}
            />
            <div className="flex-1" />
            <LimitSelect
              value={urlState.limit}
              onChange={(limit) => updateUrl((s) => ({ ...s, limit }))}
            />
            <TailToggle
              ds={ds}
              enabled={live}
              onToggle={(v) => updateUrl((s) => ({ ...s, live: v }))}
              status={tail.status}
              droppedEntries={tail.droppedEntries}
            />
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-background text-sm text-muted-foreground hover:bg-muted transition-colors"
              title="Query history (Ctrl/Cmd+H)"
            >
              History
            </button>
            <button
              type="submit"
              className="h-8 px-4 rounded-md text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
              title="Run query (Ctrl/Cmd+Enter)"
            >
              Run
            </button>
          </div>
        </form>

        <div className="flex-1 min-h-0 flex flex-col">
          {!pane.query.trim() && (
            <EmptyState>
              Type a LogQL query above and press <Kbd>Ctrl</Kbd>+
              <Kbd>Enter</Kbd> to run.
            </EmptyState>
          )}

          {pane.query.trim() && result.isLoading && (
            <EmptyState>Running query…</EmptyState>
          )}

          {result.isError && (
            <div className="p-4 max-w-3xl">
              <ErrorBanner error={result.error} />
            </div>
          )}

          {live && tail.streams.length > 0 && (
            <div className="flex-1 min-h-0">
              <LogList
                streams={tail.streams}
                wrap={urlState.wrap}
                onToggleWrap={() => updateUrl((s) => ({ ...s, wrap: !s.wrap }))}
                onFilterByField={(label, value) =>
                  handleInsertLabel(label, value, '=')
                }
                onOpenContext={(anchor) => setCtxAnchor(anchor)}
              />
            </div>
          )}

          {live && tail.streams.length === 0 && tail.status === 'open' && (
            <EmptyState>Waiting for new entries…</EmptyState>
          )}

          {!live && result.data && result.data.data.resultType === 'streams' && (() => {
            const baseStreams = result.data.data.result as Stream[];
            const merged = dedupeStreams([...baseStreams, ...olderStreams]);
            const totalEntries = merged.reduce(
              (n, s) => n + s.values.length,
              0,
            );
            const baseCount = baseStreams.reduce(
              (n, s) => n + s.values.length,
              0,
            );
            const hitLimit = baseCount >= urlState.limit;
            return (
              <>
                {queryRange && (
                  <Histogram
                    ds={ds}
                    query={pane.query}
                    fromNs={queryRange.fromNs}
                    toNs={queryRange.toNs}
                    onZoom={(fromNs, toNs) => {
                      onTimeChange(fromNs.toString(), toNs.toString());
                    }}
                  />
                )}
                <div className="flex-1 min-h-0 flex flex-col">
                  {totalEntries === 0 ? (
                    <EmptyState>No logs matched in this time range.</EmptyState>
                  ) : (
                    <>
                      <LogList
                        streams={merged}
                        wrap={urlState.wrap}
                        onToggleWrap={() =>
                          updateUrl((s) => ({ ...s, wrap: !s.wrap }))
                        }
                        stats={result.data.data.stats}
                        onFilterByField={(label, value) =>
                          handleInsertLabel(label, value, '=')
                        }
                        onOpenContext={(anchor) => setCtxAnchor(anchor)}
                      />
                      {hitLimit && (
                        <div className="flex-shrink-0 border-t border-border px-3 py-2 flex items-center justify-between gap-3 bg-card/40">
                          <span className="text-xs text-muted-foreground">
                            showing {totalEntries.toLocaleString()}{' '}
                            {totalEntries === 1 ? 'entry' : 'entries'} — more
                            may exist
                          </span>
                          <button
                            type="button"
                            disabled={loadingOlder}
                            onClick={loadOlder}
                            className="h-7 px-3 rounded-md text-xs font-medium bg-background border border-border text-foreground hover:bg-muted disabled:opacity-50"
                          >
                            {loadingOlder ? 'Loading…' : 'Load older'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            );
          })()}

          {result.data &&
            (result.data.data.resultType === 'matrix' ||
              result.data.data.resultType === 'vector') && (
              <EmptyState>
                Metric queries render as a chart in a later commit.
                resultType: {result.data.data.resultType}.
              </EmptyState>
            )}
        </div>
      </div>

      {ctxAnchor && (
        <ContextPanel
          ds={ds}
          anchor={ctxAnchor}
          onClose={() => setCtxAnchor(null)}
        />
      )}
    </div>
  );
}

function TailToggle({
  ds,
  enabled,
  onToggle,
  status,
  droppedEntries,
}: {
  ds: StoredDatasource;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  status: ReturnType<typeof useTail>['status'];
  droppedEntries: number;
}) {
  const allowed = canTail(toDatasource(ds));
  const tooltip = allowed
    ? enabled
      ? `Stop live tail${status === 'connecting' ? ' (connecting…)' : ''}`
      : 'Start live tail'
    : 'Live tail disabled: basic/bearer auth cannot set headers on a WebSocket. Enable "my proxy sets an auth cookie" in datasource settings to use tail with auth.';
  return (
    <button
      type="button"
      disabled={!allowed}
      onClick={() => onToggle(!enabled)}
      title={tooltip}
      className={
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-sm transition-colors ' +
        (enabled
          ? 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
          : 'border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed')
      }
    >
      <span
        className={
          'size-1.5 rounded-full ' +
          (status === 'open'
            ? 'bg-accent animate-pulse'
            : status === 'connecting'
              ? 'bg-[var(--color-level-warn)] animate-pulse'
              : status === 'error'
                ? 'bg-[var(--color-level-error)]'
                : 'bg-subtle-foreground')
        }
      />
      Live
      {droppedEntries > 0 && (
        <span
          className="text-[10px] text-[var(--color-level-warn)]"
          title={`${droppedEntries} dropped entries since tail started`}
        >
          {droppedEntries} dropped
        </span>
      )}
    </button>
  );
}

/**
 * Merge + dedupe streams by (labels, ts, line). Loki can return the same
 * entry at a boundary when paginating with end = oldest.ts (end is exclusive
 * but nanosecond collisions exist).
 */
function dedupeStreams(streams: Stream[]): Stream[] {
  const byKey = new Map<string, Stream>();
  for (const s of streams) {
    const k = streamKey(s.stream);
    const prev = byKey.get(k);
    if (prev) {
      prev.values = prev.values.concat(s.values);
    } else {
      byKey.set(k, { stream: s.stream, values: [...s.values] });
    }
  }
  for (const s of byKey.values()) {
    const seen = new Set<string>();
    s.values = s.values.filter((v) => {
      const dk = `${v[0]}|${v[1]}`;
      if (seen.has(dk)) return false;
      seen.add(dk);
      return true;
    });
    s.values.sort((a, b) => (BigInt(b[0]) > BigInt(a[0]) ? 1 : -1));
  }
  return [...byKey.values()];
}

function streamKey(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

/** Extract the leading `{...}` stream selector from a LogQL query. */
function extractSelector(query: string): string {
  const m = /^\s*(\{[^}]*\})/.exec(query);
  return m ? m[1]! : '';
}

/**
 * Insert or extend `label<op>"value"` in the leading stream selector of a
 * LogQL query. Best-effort:
 *   - New label with `=`  → append inside {...}
 *   - Existing label with `=` and different value → switch to `=~"a|b"`
 *   - Existing label with `!=` etc → append (user will clean up)
 * If the query has no selector, creates one.
 */
function insertLabelInSelector(
  query: string,
  label: string,
  value: string,
  op: '=' | '!=' | '=~' | '!~',
): string {
  const escaped = value.replace(/"/g, '\\"');
  const m = /^\s*(\{)([^}]*)(\})(.*)$/s.exec(query);
  if (!m) {
    // No selector at all — prepend one.
    return `{${label}${op}"${escaped}"} ${query.trim()}`.trim();
  }
  const open = m[1]!;
  const body = m[2]!;
  const close = m[3]!;
  const rest = m[4] ?? '';

  // Look for existing clause for this label with `=` (the common case).
  const eqRe = new RegExp(
    String.raw`(^|,\s*)${escapeRegex(label)}\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"`,
  );
  const eqMatch = eqRe.exec(body);
  if (eqMatch && op === '=') {
    const existing = eqMatch[2]!;
    if (existing === escaped) return query; // already present
    // Convert to regex union =~"a|b"
    const joined = `${existing}|${escaped}`;
    const newBody = body.replace(
      eqRe,
      `$1${label}=~"${joined}"`,
    );
    return `${open}${newBody}${close}${rest}`;
  }

  const clause = `${label}${op}"${escaped}"`;
  const newBody =
    body.trim() === '' ? clause : `${body.replace(/\s*$/, '')}, ${clause}`;
  return `${open}${newBody}${close}${rest}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function useMirrorDatasource(
  current: string | null,
  actualId: string,
  setTo: (id: string) => void,
) {
  if (current !== actualId) {
    queueMicrotask(() => setTo(actualId));
  }
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 grid place-items-center text-sm text-muted-foreground text-center px-6 py-12">
      <div>{children}</div>
    </div>
  );
}

function ErrorBanner({ error }: { error: LokiRequestError }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[var(--color-level-error)]/40 bg-[var(--color-level-error)]/10 px-3 py-2 text-sm text-[var(--color-level-error)]"
    >
      {describeError(error.error)}
    </div>
  );
}

function LimitSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span>limit</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 px-2 rounded-md bg-background border border-input text-foreground text-sm focus:border-ring focus:outline-none"
      >
        {[100, 500, 1000, 2000, 5000].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center h-5 px-1.5 text-[11px] font-mono rounded border border-border bg-muted text-foreground">
      {children}
    </kbd>
  );
}
