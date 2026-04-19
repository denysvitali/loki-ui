import { useMemo, useState, type FormEvent } from 'react';
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
import { TimeRangePicker } from './TimeRangePicker';
import { LogList } from './LogList';

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

  // Keep the datasource selection mirrored into URL state.
  useMirrorDatasource(pane.datasourceId, ds.id, (id) =>
    updateUrl((s) => ({
      ...s,
      panes: [{ ...(s.panes[0] ?? pane), datasourceId: id }],
    })),
  );

  const [draftQuery, setDraftQuery] = useState(pane.query);

  const onRun = (e?: FormEvent) => {
    e?.preventDefault();
    updateUrl((s) => ({
      ...s,
      panes: [{ ...(s.panes[0] ?? pane), query: draftQuery }],
    }));
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

  const range = useMemo(() => {
    if (!pane.query.trim()) return null;
    try {
      return resolveRange(pane.from, pane.to, new Date(), browserTimeZone());
    } catch {
      return null;
    }
  }, [pane.query, pane.from, pane.to]);

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
    enabled: Boolean(range && pane.query.trim()),
    queryFn: async ({ signal }) => {
      if (!range) throw new Error('no range');
      return client.queryRange(
        {
          query: pane.query,
          start: range.fromNs,
          end: range.toNs,
          limit: urlState.limit,
          direction: 'backward',
        },
        signal,
      );
    },
  });

  return (
    <div className="flex flex-col h-full min-h-0">
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
          <TimeRangePicker from={pane.from} to={pane.to} onChange={onTimeChange} />
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

      <div className="flex-1 min-h-0 overflow-auto">
        {!pane.query.trim() && (
          <EmptyState>
            Type a LogQL query above and press <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>{' '}
            to run.
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
          <LogList
            streams={result.data.data.result}
            wrap={urlState.wrap}
            onToggleWrap={() =>
              updateUrl((s) => ({ ...s, wrap: !s.wrap }))
            }
            stats={result.data.data.stats}
          />
        )}

        {result.data &&
          (result.data.data.resultType === 'matrix' ||
            result.data.data.resultType === 'vector') && (
            <EmptyState>
              Metric queries render as a chart in the next commit. Response
              type: {result.data.data.resultType}.
            </EmptyState>
          )}

        {result.data &&
          result.data.data.resultType === 'streams' &&
          (result.data.data.result as Stream[]).length === 0 && (
            <EmptyState>No logs matched in this time range.</EmptyState>
          )}
      </div>
    </div>
  );
}

function useMirrorDatasource(
  current: string | null,
  actualId: string,
  setTo: (id: string) => void,
) {
  // When the active datasource changes in the top bar, reflect it in URL.
  if (current !== actualId) {
    // Defer to avoid setState during render
    queueMicrotask(() => setTo(actualId));
  }
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full grid place-items-center text-sm text-muted-foreground text-center px-6 py-12">
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
