import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LokiClient, type LokiRequestError } from '@/lib/loki';
import {
  loadCredentials,
  toDatasource,
  type StoredDatasource,
} from '@/lib/state/datasources';

interface LabelBrowserProps {
  ds: StoredDatasource;
  selector: string; // current `{...}` selector from the query
  fromNs: bigint;
  toNs: bigint;
  /** Called with ('key', 'value', operator) to add to selector. */
  onInsertLabel: (
    label: string,
    value: string,
    op: '=' | '!=' | '=~' | '!~',
  ) => void;
  onAddLineFilter: (op: '|=' | '!=' | '|~' | '!~', text: string) => void;
}

const PINNED_KEY = 'loki-ui:pinnedLabels';

function loadPinned(dsId: string): string[] {
  try {
    const raw = localStorage.getItem(`${PINNED_KEY}:${dsId}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function savePinned(dsId: string, labels: string[]) {
  try {
    localStorage.setItem(`${PINNED_KEY}:${dsId}`, JSON.stringify(labels));
  } catch {
    /* noop */
  }
}

export function LabelBrowser({
  ds,
  selector,
  fromNs,
  toNs,
  onInsertLabel,
  onAddLineFilter,
}: LabelBrowserProps) {
  const client = useMemo(
    () =>
      new LokiClient(
        toDatasource(ds),
        loadCredentials(ds.id, ds.credentialTier),
      ),
    [ds.id, ds.url, ds.authType, ds.tenant, ds.credentialTier],
  );

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<string[]>(() => loadPinned(ds.id));

  useEffect(() => {
    setPinned(loadPinned(ds.id));
  }, [ds.id]);

  const labelsQ = useQuery<string[], LokiRequestError>({
    queryKey: [
      'labels',
      ds.id,
      selector || '*',
      bucket(fromNs, toNs),
    ],
    staleTime: 30_000,
    queryFn: async ({ signal }) =>
      client.labels(
        {
          start: fromNs,
          end: toNs,
          ...(selector ? { query: selector } : {}),
        },
        signal,
      ),
  });

  const seriesQ = useQuery({
    queryKey: ['series-for-browser', ds.id, selector || '*', bucket(fromNs, toNs)],
    staleTime: 30_000,
    enabled: Boolean(selector),
    queryFn: async ({ signal }) =>
      client.series(
        {
          matches: [selector],
          start: fromNs,
          end: toNs,
        },
        signal,
      ),
  });

  const cardinality = useMemo(() => {
    const map = new Map<string, number>();
    if (!seriesQ.data) return map;
    for (const s of seriesQ.data) {
      for (const k of Object.keys(s)) {
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return map;
  }, [seriesQ.data]);

  const orderedLabels = useMemo(() => {
    const list = labelsQ.data ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((l) => l.toLowerCase().includes(q)) : list;
    const pinnedSet = new Set(pinned);
    const [pinnedList, rest] = partition(filtered, (l) => pinnedSet.has(l));
    // Order rest by cardinality ascending (low-card first), fallback alphabetical.
    rest.sort((a, b) => {
      const ca = cardinality.get(a) ?? Infinity;
      const cb = cardinality.get(b) ?? Infinity;
      if (ca !== cb) return ca - cb;
      return a.localeCompare(b);
    });
    pinnedList.sort((a, b) => a.localeCompare(b));
    return [...pinnedList, ...rest];
  }, [labelsQ.data, search, pinned, cardinality]);

  const toggleLabel = (l: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  };

  const togglePin = (l: string) => {
    setPinned((prev) => {
      const next = prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l];
      savePinned(ds.id, next);
      return next;
    });
  };

  const streamCount = seriesQ.data?.length;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="uppercase tracking-wider text-xs text-subtle-foreground">
            Labels
          </span>
          {streamCount != null && (
            <span
              className="text-xs text-muted-foreground tabular-nums"
              title="Streams matching the current selector"
            >
              {streamCount.toLocaleString()} streams
            </span>
          )}
        </div>
        <input
          type="search"
          placeholder="Search labels…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-7 px-2 rounded-md bg-background border border-input text-sm text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-auto">
        {labelsQ.isLoading && (
          <div className="p-3 text-xs text-subtle-foreground">Loading…</div>
        )}
        {labelsQ.isError && (
          <div className="p-3 text-xs text-[var(--color-level-error)]">
            {labelsQ.error.error.kind}
          </div>
        )}
        {orderedLabels.length === 0 && !labelsQ.isLoading && (
          <div className="p-3 text-xs text-subtle-foreground">
            No labels in this range.
          </div>
        )}
        <ul className="text-sm">
          {orderedLabels.map((l) => (
            <LabelRow
              key={l}
              label={l}
              expanded={expanded.has(l)}
              pinned={pinned.includes(l)}
              cardinality={cardinality.get(l)}
              onToggle={() => toggleLabel(l)}
              onTogglePin={() => togglePin(l)}
              client={client}
              dsId={ds.id}
              selector={selector}
              fromNs={fromNs}
              toNs={toNs}
              onInsertLabel={onInsertLabel}
            />
          ))}
        </ul>
      </div>

      <div className="p-3 border-t border-border space-y-2">
        <div className="uppercase tracking-wider text-xs text-subtle-foreground">
          Line filters
        </div>
        <LineFilterRow
          op="|="
          placeholder='"error"'
          title="contains"
          onSubmit={(text) => onAddLineFilter('|=', text)}
        />
        <LineFilterRow
          op="!="
          placeholder='"healthcheck"'
          title="does not contain"
          onSubmit={(text) => onAddLineFilter('!=', text)}
        />
        <LineFilterRow
          op="|~"
          placeholder='"(?i)timeout"'
          title="matches regex"
          onSubmit={(text) => onAddLineFilter('|~', text)}
        />
      </div>
    </div>
  );
}

function LabelRow({
  label,
  expanded,
  pinned,
  cardinality,
  onToggle,
  onTogglePin,
  client,
  dsId,
  selector,
  fromNs,
  toNs,
  onInsertLabel,
}: {
  label: string;
  expanded: boolean;
  pinned: boolean;
  cardinality: number | undefined;
  onToggle: () => void;
  onTogglePin: () => void;
  client: LokiClient;
  dsId: string;
  selector: string;
  fromNs: bigint;
  toNs: bigint;
  onInsertLabel: (l: string, v: string, op: '=' | '!=' | '=~' | '!~') => void;
}) {
  const [search, setSearch] = useState('');

  const valuesQ = useQuery<string[], LokiRequestError>({
    queryKey: ['values', dsId, label, selector || '*', bucket(fromNs, toNs)],
    enabled: expanded,
    staleTime: 30_000,
    queryFn: async ({ signal }) =>
      client.labelValues(
        label,
        {
          start: fromNs,
          end: toNs,
          ...(selector ? { query: selector } : {}),
        },
        signal,
      ),
  });

  const filteredValues = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = valuesQ.data ?? [];
    const list = q ? all.filter((v) => v.toLowerCase().includes(q)) : all;
    // Cap to 200 to keep DOM light.
    return { list: list.slice(0, 200), total: list.length };
  }, [valuesQ.data, search]);

  return (
    <li className="border-b border-border/40">
      <div className="flex items-center gap-1 px-2 py-1 hover:bg-muted/40 group">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex-1 flex items-center gap-2 text-left"
        >
          <span className="text-subtle-foreground text-[10px] w-3">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="text-foreground font-mono">{label}</span>
          {cardinality != null && (
            <span className="text-[10px] text-subtle-foreground ml-auto">
              {cardinality}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onTogglePin}
          title={pinned ? 'Unpin' : 'Pin to top'}
          aria-label={pinned ? 'Unpin label' : 'Pin label'}
          className={`opacity-0 group-hover:opacity-100 transition-opacity text-xs ${pinned ? 'text-accent opacity-100' : 'text-subtle-foreground hover:text-foreground'}`}
        >
          ★
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2">
          <input
            type="search"
            placeholder="Filter values…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-6 px-1.5 mb-1 rounded bg-background border border-input text-xs text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none"
          />
          {valuesQ.isLoading && (
            <div className="text-[11px] text-subtle-foreground pl-2">Loading…</div>
          )}
          {valuesQ.data && (
            <ul className="max-h-64 overflow-auto">
              {filteredValues.list.map((v) => (
                <li key={v}>
                  <button
                    type="button"
                    onClick={(e) => {
                      const op =
                        e.altKey ? '!=' : e.shiftKey ? '=~' : '=';
                      onInsertLabel(label, v, op);
                    }}
                    title='click: = · alt-click: != · shift-click: =~'
                    className="w-full text-left text-xs font-mono px-2 py-0.5 rounded hover:bg-muted truncate text-foreground"
                  >
                    {v}
                  </button>
                </li>
              ))}
              {filteredValues.total > 200 && (
                <li className="px-2 py-1 text-[11px] text-subtle-foreground">
                  +{filteredValues.total - 200} more — type to search
                </li>
              )}
              {filteredValues.total === 0 && valuesQ.data.length > 0 && (
                <li className="px-2 py-1 text-[11px] text-subtle-foreground">
                  No match
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function LineFilterRow({
  op,
  placeholder,
  title,
  onSubmit,
}: {
  op: '|=' | '!=' | '|~' | '!~';
  placeholder: string;
  title: string;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const submit = () => {
    const t = value.trim();
    if (!t) return;
    onSubmit(t);
    setValue('');
  };
  return (
    <div className="flex items-center gap-1">
      <span
        className="font-mono text-xs text-subtle-foreground w-6 shrink-0"
        title={title}
      >
        {op}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="flex-1 h-6 px-1.5 rounded bg-background border border-input text-xs font-mono text-foreground placeholder:text-subtle-foreground focus:border-ring focus:outline-none"
      />
    </div>
  );
}

function partition<T>(xs: T[], pred: (x: T) => boolean): [T[], T[]] {
  const yes: T[] = [];
  const no: T[] = [];
  for (const x of xs) (pred(x) ? yes : no).push(x);
  return [yes, no];
}

/** Bucket a time range so repeated queries in the same minute share cache. */
function bucket(fromNs: bigint, toNs: bigint): string {
  const span = toNs - fromNs;
  // Round `to` down to the nearest minute.
  const toMs = Number(toNs / 1_000_000n);
  const roundedTo = Math.floor(toMs / 60_000) * 60_000;
  return `${span.toString()}:${roundedTo}`;
}
