import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LokiClient, type QueryResponse } from '@/lib/loki';
import { describe as describeError, LokiRequestError } from '@/lib/loki';
import {
  loadCredentials,
  toDatasource,
  type StoredDatasource,
} from '@/lib/state/datasources';
import { useUrlState } from '@/lib/state/useUrlState';
import { resolveRange, browserTimeZone } from '@/lib/time/grammar';
import { LabelBrowser } from '@/features/labels/LabelBrowser';
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
          className="border-b border-border bg-card/40 p-3 space-y-2 flex-shrink-0"
        >
          <textarea
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onRun();
              }
            }}
            placeholder='{app="foo"} |= "error"'
            rows={2}
            spellCheck={false}
            className="w-full px-3 py-2 rounded-md bg-background border border-input font-mono text-sm text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none resize-y"
          />
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

          {result.data && result.data.data.resultType === 'streams' && (
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
              <div className="flex-1 min-h-0">
                {result.data.data.result.length === 0 ? (
                  <EmptyState>No logs matched in this time range.</EmptyState>
                ) : (
                  <LogList
                    streams={result.data.data.result}
                    wrap={urlState.wrap}
                    onToggleWrap={() =>
                      updateUrl((s) => ({ ...s, wrap: !s.wrap }))
                    }
                    stats={result.data.data.stats}
                    onFilterByField={(label, value) =>
                      handleInsertLabel(label, value, '=')
                    }
                  />
                )}
              </div>
            </>
          )}

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
    </div>
  );
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
