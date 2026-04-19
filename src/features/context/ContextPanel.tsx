import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LokiClient,
  type LokiRequestError,
  type QueryResponse,
  describe as describeError,
} from '@/lib/loki';
import {
  loadCredentials,
  toDatasource,
  type StoredDatasource,
} from '@/lib/state/datasources';
import { LogList } from '@/features/explore/LogList';

export interface ContextAnchor {
  /** Nanosecond-precision timestamp string from the anchor row. */
  ts: string;
  /** Stream labels of the anchor row. */
  labels: Record<string, string>;
}

interface ContextPanelProps {
  ds: StoredDatasource;
  anchor: ContextAnchor;
  onClose: () => void;
}

const NOISE_LABELS = new Set(['level', 'lvl', 'severity', 'log_level']);
const WINDOW_NS = 10n * 60n * 1_000_000_000n; // ±10 minutes

export function ContextPanel({ ds, anchor, onClose }: ContextPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const client = useMemo(
    () =>
      new LokiClient(
        toDatasource(ds),
        loadCredentials(ds.id, ds.credentialTier),
      ),
    [ds.id, ds.url, ds.authType, ds.tenant, ds.credentialTier],
  );

  const selector = useMemo(() => buildContextSelector(anchor.labels), [anchor.labels]);
  const anchorNs = useMemo(() => BigInt(anchor.ts), [anchor.ts]);

  const q = useQuery<QueryResponse, LokiRequestError>({
    queryKey: ['context', ds.id, selector, anchor.ts],
    staleTime: 60_000,
    queryFn: async ({ signal }) =>
      client.queryRange(
        {
          query: selector,
          start: anchorNs - WINDOW_NS,
          end: anchorNs + WINDOW_NS,
          limit: 2000,
          direction: 'backward',
        },
        signal,
      ),
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ctx-title"
      className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm flex"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-ctx-panel]')) return;
        onClose();
      }}
    >
      <div className="flex-1" />
      <aside
        data-ctx-panel
        className="w-full md:w-[60vw] min-w-0 h-full flex flex-col bg-card border-l border-border shadow-2xl"
      >
        <header className="h-12 shrink-0 border-b border-border px-4 flex items-center gap-3">
          <div id="ctx-title" className="flex-1 min-w-0">
            <div className="text-xs text-subtle-foreground uppercase tracking-wider">
              Context
            </div>
            <div className="text-sm text-foreground truncate font-mono">
              ±10m around {formatAnchorTime(anchor.ts)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close context"
            className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            ×
          </button>
        </header>

        <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground">
          <span className="text-subtle-foreground">selector: </span>
          <code className="font-mono text-foreground">{selector}</code>
        </div>

        <div className="flex-1 min-h-0">
          {q.isLoading && (
            <div className="p-4 text-sm text-subtle-foreground">Loading…</div>
          )}
          {q.isError && (
            <div className="p-4 text-sm text-[var(--color-level-error)]">
              {describeError(q.error.error)}
            </div>
          )}
          {q.data && q.data.data.resultType === 'streams' && (
            <LogList
              streams={q.data.data.result}
              wrap={true}
              onToggleWrap={() => { /* not URL-encoded in context view */ }}
              stats={q.data.data.stats}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function buildContextSelector(labels: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(labels)) {
    if (NOISE_LABELS.has(k)) continue;
    parts.push(`${k}="${v.replace(/"/g, '\\"')}"`);
  }
  return `{${parts.join(', ')}}`;
}

function formatAnchorTime(ts: string): string {
  try {
    const ms = Number(BigInt(ts) / 1_000_000n);
    return new Date(ms).toLocaleString();
  } catch {
    return ts;
  }
}
