import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LokiStats, Stream, StreamValue } from '@/lib/loki';
import { parseStructured, type ParsedStructured } from '@/lib/parse/structured';

interface LogRow {
  ts: string; // ns epoch as string
  line: string;
  labels: Record<string, string>;
  metadata?: Record<string, string>;
  level: Level;
  parsed: ParsedStructured | null;
}

export type Level = 'error' | 'warn' | 'info' | 'debug' | 'none';

interface LogListProps {
  streams: Stream[];
  wrap: boolean;
  onToggleWrap: () => void;
  stats?: LokiStats | undefined;
  onFilterByField?: (label: string, value: string) => void;
  onOpenContext?: (anchor: {
    ts: string;
    labels: Record<string, string>;
  }) => void;
}

/** Approximate row height used for virtualization. Actual heights vary. */
const COLLAPSED_HEIGHT = 22;
const EXPANDED_OVERHEAD = 120;

export function LogList({
  streams,
  wrap,
  onToggleWrap,
  stats,
  onFilterByField,
  onOpenContext,
}: LogListProps) {
  const rows = useMemo(() => flattenStreams(streams), [streams]);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) =>
      expanded.has(i) ? COLLAPSED_HEIGHT + EXPANDED_OVERHEAD : COLLAPSED_HEIGHT,
    overscan: 20,
  });

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    // Force virtualizer to remeasure the toggled row.
    virtualizer.measure();
  };

  if (rows.length === 0) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-border text-xs text-muted-foreground">
        <span>
          {rows.length.toLocaleString()} {rows.length === 1 ? 'entry' : 'entries'}
        </span>
        <div className="flex items-center gap-3">
          {stats?.summary && <Stats stats={stats} />}
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={wrap} onChange={onToggleWrap} />
            wrap lines
          </label>
        </div>
      </div>
      <div
        ref={parentRef}
        role="grid"
        aria-rowcount={rows.length}
        aria-label="Log entries"
        className="flex-1 overflow-auto font-mono text-xs"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index]!;
            const isExpanded = expanded.has(v.index);
            return (
              <div
                key={v.key}
                data-index={v.index}
                ref={(el) => el && virtualizer.measureElement(el)}
                role="row"
                aria-rowindex={v.index + 1}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${v.start}px)`,
                }}
              >
                <LogRowView
                  row={row}
                  expanded={isExpanded}
                  wrap={wrap}
                  onToggle={() => toggle(v.index)}
                  onFilterByField={onFilterByField}
                  onOpenContext={onOpenContext}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LogRowView({
  row,
  expanded,
  wrap,
  onToggle,
  onFilterByField,
  onOpenContext,
}: {
  row: LogRow;
  expanded: boolean;
  wrap: boolean;
  onToggle: () => void;
  onFilterByField?: (label: string, value: string) => void;
  onOpenContext?: (anchor: {
    ts: string;
    labels: Record<string, string>;
  }) => void;
}) {
  return (
    <div
      className="border-b border-border/40 hover:bg-muted/40 focus-within:bg-muted/40"
      onClick={onToggle}
    >
      <div className="flex items-start gap-3 px-3 py-1 cursor-pointer">
        <LevelBadge level={row.level} />
        <span className="text-subtle-foreground shrink-0 tabular-nums select-none">
          {formatTs(row.ts)}
        </span>
        <span
          className={
            'flex-1 min-w-0 text-foreground ' +
            (wrap
              ? 'whitespace-pre-wrap break-words'
              : 'whitespace-pre overflow-hidden text-ellipsis')
          }
        >
          <HighlightedLine parsed={row.parsed} expanded={expanded} line={row.line} />
        </span>
      </div>
      {expanded && (
        <div
          className="px-3 pb-2 pl-[60px] space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <FieldTree
            title="labels"
            fields={row.labels}
            onFilterByField={onFilterByField}
          />
          {row.metadata && Object.keys(row.metadata).length > 0 && (
            <FieldTree
              title="metadata"
              fields={row.metadata}
              tone="accent"
            />
          )}
          <ParsedFields parsed={row.parsed} onFilterByField={onFilterByField} />
          <CopyActions row={row} onOpenContext={onOpenContext} />
        </div>
      )}
    </div>
  );
}

function FieldTree({
  title,
  fields,
  tone = 'muted',
  onFilterByField,
}: {
  title: string;
  fields: Record<string, string>;
  tone?: 'muted' | 'accent';
  onFilterByField?: (label: string, value: string) => void;
}) {
  const entries = Object.entries(fields);
  if (entries.length === 0) return null;
  const pillBg = tone === 'accent' ? 'bg-accent/10' : 'bg-muted';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-subtle-foreground mb-1">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => onFilterByField?.(k, v)}
            title={onFilterByField ? `Filter by ${k}="${v}"` : undefined}
            className={`inline-flex items-center max-w-[28rem] rounded border border-border ${pillBg} px-1.5 py-0.5 text-[11px] hover:border-accent`}
          >
            <span className="text-muted-foreground">{k}</span>
            <span className="text-subtle-foreground mx-1">=</span>
            <span className="text-foreground truncate">{v}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ParsedFields({
  parsed,
  onFilterByField,
}: {
  parsed: ParsedStructured | null;
  onFilterByField?: (label: string, value: string) => void;
}) {
  if (!parsed) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-subtle-foreground mb-1">
        {parsed.format} fields
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(parsed.fields).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => onFilterByField?.(k, String(v))}
            title={onFilterByField ? `Filter by ${k}="${v}"` : undefined}
            className="inline-flex items-center max-w-[28rem] rounded border border-border bg-background px-1.5 py-0.5 text-[11px] hover:border-accent"
          >
            <span className="text-muted-foreground">{k}</span>
            <span className="text-subtle-foreground mx-1">=</span>
            <span className="text-foreground truncate">{String(v)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CopyActions({
  row,
  onOpenContext,
}: {
  row: LogRow;
  onOpenContext?: (anchor: {
    ts: string;
    labels: Record<string, string>;
  }) => void;
}) {
  const iso = new Date(Number(BigInt(row.ts) / 1_000_000n)).toISOString();
  const labelsStr = Object.entries(row.labels)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  const copy = (s: string) => navigator.clipboard?.writeText(s);
  return (
    <div className="flex items-center gap-3 text-[11px] text-subtle-foreground">
      <button
        type="button"
        onClick={() => copy(row.line)}
        className="hover:text-foreground"
      >
        copy line
      </button>
      <button
        type="button"
        onClick={() => copy(`${iso}\t${labelsStr}\t${row.line}`)}
        className="hover:text-foreground"
      >
        copy with labels
      </button>
      <button
        type="button"
        onClick={() =>
          copy(
            JSON.stringify(
              { ts: row.ts, iso, labels: row.labels, line: row.line },
              null,
              2,
            ),
          )
        }
        className="hover:text-foreground"
      >
        copy as JSON
      </button>
      {onOpenContext && (
        <button
          type="button"
          onClick={() => onOpenContext({ ts: row.ts, labels: row.labels })}
          className="hover:text-accent"
          title="Show surrounding logs from the same stream"
        >
          open context
        </button>
      )}
    </div>
  );
}

function Stats({ stats }: { stats: LokiStats }) {
  const s = stats.summary;
  if (!s) return null;
  return (
    <span className="text-subtle-foreground hidden sm:inline">
      {s.execTime != null && <>exec {formatDuration(s.execTime)} · </>}
      {s.totalBytesProcessed != null && (
        <>{formatBytes(s.totalBytesProcessed)} · </>
      )}
      {s.totalLinesProcessed != null && (
        <>{s.totalLinesProcessed.toLocaleString()} lines</>
      )}
    </span>
  );
}

function HighlightedLine({
  parsed,
  expanded,
  line,
}: {
  parsed: ParsedStructured | null;
  expanded: boolean;
  line: string;
}) {
  const text = expanded ? line : line.slice(0, 1000);
  if (!parsed) return <>{text}</>;

  if (parsed.format === 'json') return <JsonHighlight fields={parsed.fields} />;
  if (parsed.format === 'logfmt') return <LogfmtHighlight fields={parsed.fields} />;
  if (parsed.format === 'tabular')
    return <TabularHighlight fields={parsed.fields} />;
  return <>{text}</>;
}

const JSON_META_KEYS = new Set(['time', 'ts', 'timestamp', 'level', 'lvl', 'severity', 'log_level']);
const JSON_MSG_KEYS = new Set(['msg', 'message']);

function JsonHighlight({
  fields,
}: {
  fields: Record<string, string | number | boolean | null>;
}) {
  const entries = Object.entries(fields);
  const sorted = entries.sort(([a], [b]) => {
    const aM = JSON_MSG_KEYS.has(a) ? 0 : JSON_META_KEYS.has(a) ? 2 : 1;
    const bM = JSON_MSG_KEYS.has(b) ? 0 : JSON_META_KEYS.has(b) ? 2 : 1;
    return aM - bM;
  });

  return (
    <>
      {sorted.map(([key, raw], i) => {
        const val = String(raw ?? '');
        const isMsg = JSON_MSG_KEYS.has(key);
        const isMeta = JSON_META_KEYS.has(key);
        return (
          <span key={key}>
            {i > 0 && ' '}
            <span className={isMeta ? 'text-subtle-foreground/60' : 'text-muted-foreground'}>{key}</span>
            <span className="text-subtle-foreground">=</span>
            <span
              className={
                isMsg
                  ? 'text-foreground font-medium'
                  : isMeta
                    ? 'text-subtle-foreground/60'
                    : ''
              }
            >
              {val}
            </span>
          </span>
        );
      })}
    </>
  );
}

const LOGFMT_META_KEYS = new Set(['time', 'ts', 'timestamp', 'level', 'lvl', 'severity']);
const LOGFMT_MSG_KEYS = new Set(['msg', 'message']);

function LogfmtHighlight({
  fields,
}: {
  fields: Record<string, string | number | boolean | null>;
}) {
  const entries = Object.entries(fields);
  // Show msg/message first, then other fields, meta keys (time/level) last
  const sorted = entries.sort(([a], [b]) => {
    const aM = LOGFMT_MSG_KEYS.has(a) ? 0 : LOGFMT_META_KEYS.has(a) ? 2 : 1;
    const bM = LOGFMT_MSG_KEYS.has(b) ? 0 : LOGFMT_META_KEYS.has(b) ? 2 : 1;
    return aM - bM;
  });

  return (
    <>
      {sorted.map(([key, raw], i) => {
        const val = String(raw);
        const isMsg = LOGFMT_MSG_KEYS.has(key);
        const isMeta = LOGFMT_META_KEYS.has(key);
        const needsQuote = val.includes(' ');
        return (
          <span key={key}>
            {i > 0 && ' '}
            <span className={isMeta ? 'text-subtle-foreground/60' : 'text-muted-foreground'}>
              {key}
            </span>
            <span className="text-subtle-foreground">=</span>
            <span
              className={
                isMsg
                  ? 'text-foreground font-medium'
                  : isMeta
                    ? 'text-subtle-foreground/60'
                    : ''
              }
            >
              {needsQuote ? `"${val}"` : val}
            </span>
          </span>
        );
      })}
    </>
  );
}

function TabularHighlight({
  fields,
}: {
  fields: Record<string, string | number | boolean | null>;
}) {
  const logger = fields.logger != null ? String(fields.logger) : '';
  const msg = fields.msg != null ? String(fields.msg) : '';
  const rest = Object.entries(fields).filter(
    ([k]) => k !== 'logger' && k !== 'msg',
  );

  return (
    <>
      {logger && (
        <span className="text-accent font-medium">{logger}</span>
      )}
      {logger && msg && ' '}
      {msg && <span className="text-foreground">{msg}</span>}
      {rest.length > 0 && (
        <span className="text-muted-foreground">
          {' '}
          {rest.map(([key, raw]) => {
            const val = String(raw);
            return (
              <span key={key}>
                {' '}
                <span>{key}</span>
                <span>=</span>
                <span className="text-subtle-foreground">{val}</span>
              </span>
            );
          })}
        </span>
      )}
    </>
  );
}

function LevelBadge({ level }: { level: Level }) {
  const colors: Record<Level, string> = {
    error: 'var(--color-level-error)',
    warn: 'var(--color-level-warn)',
    info: 'var(--color-level-info)',
    debug: 'var(--color-level-debug)',
    none: 'transparent',
  };
  const short: Record<Level, string> = {
    error: 'ERR',
    warn: 'WRN',
    info: 'INF',
    debug: 'DBG',
    none: '·',
  };
  return (
    <span
      aria-label={`level ${level}`}
      className="shrink-0 inline-flex items-center justify-center w-8 h-4 text-[10px] font-semibold rounded-sm"
      style={{
        color: colors[level],
        border: `1px solid ${colors[level]}33`,
        background: `${colors[level]}10`,
      }}
    >
      {short[level]}
    </span>
  );
}

function flattenStreams(streams: Stream[]): LogRow[] {
  const out: LogRow[] = [];
  for (const s of streams) {
    for (const v of s.values) {
      const [ts, line, metadata] = v as StreamValue;
      out.push({
        ts,
        line,
        labels: s.stream,
        ...(metadata ? { metadata } : {}),
        level: detectLevel(s.stream, line),
        parsed: parseStructured(line),
      });
    }
  }
  out.sort((a, b) => (BigInt(b.ts) > BigInt(a.ts) ? 1 : -1));
  return out;
}

function detectLevel(labels: Record<string, string>, line: string): Level {
  const labelValue =
    labels['level'] ??
    labels['lvl'] ??
    labels['severity'] ??
    labels['log_level'];
  if (labelValue) return normalizeLevel(labelValue);
  if (/\b(fatal|critical|panic|err(or)?|alert)\b/i.test(line)) return 'error';
  if (/\b(warn(ing)?|caution)\b/i.test(line)) return 'warn';
  if (/\b(info|notice)\b/i.test(line)) return 'info';
  if (/\b(debug|trace|verbose)\b/i.test(line)) return 'debug';
  return 'none';
}

function normalizeLevel(v: string): Level {
  const s = v.toLowerCase();
  if (/(fatal|crit|panic|err|alert)/.test(s)) return 'error';
  if (/(warn|caution)/.test(s)) return 'warn';
  if (/(info|notice)/.test(s)) return 'info';
  if (/(debug|trace|verbose)/.test(s)) return 'debug';
  return 'none';
}

function formatTs(nsStr: string): string {
  try {
    const ms = Number(BigInt(nsStr) / 1_000_000n);
    const d = new Date(ms);
    return (
      d.toLocaleTimeString(undefined, { hour12: false }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  } catch {
    return nsStr;
  }
}

function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  return `${seconds.toFixed(2)} s`;
}
