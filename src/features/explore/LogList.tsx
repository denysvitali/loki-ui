import { useMemo } from 'react';
import type { LokiStats, Stream, StreamValue } from '@/lib/loki';

interface LogRow {
  ts: string; // ns epoch as string
  line: string;
  labels: Record<string, string>;
  metadata?: Record<string, string>;
  level: Level;
}

type Level = 'error' | 'warn' | 'info' | 'debug' | 'none';

interface LogListProps {
  streams: Stream[];
  wrap: boolean;
  onToggleWrap: () => void;
  stats?: LokiStats | undefined;
}

export function LogList({ streams, wrap, onToggleWrap, stats }: LogListProps) {
  const rows = useMemo(() => flattenStreams(streams), [streams]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-border text-xs text-muted-foreground">
        <span>
          {rows.length.toLocaleString()} {rows.length === 1 ? 'entry' : 'entries'}
        </span>
        <div className="flex items-center gap-3">
          {stats?.summary && (
            <Stats stats={stats} />
          )}
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={wrap}
              onChange={onToggleWrap}
            />
            wrap lines
          </label>
        </div>
      </div>
      <ul className="flex-1 overflow-auto divide-y divide-border/50 font-mono text-xs">
        {rows.map((row, i) => (
          <li
            key={`${row.ts}-${i}`}
            className="flex items-start gap-3 px-3 py-1 hover:bg-muted/40"
          >
            <LevelBadge level={row.level} />
            <span className="text-subtle-foreground shrink-0 tabular-nums">
              {formatTs(row.ts)}
            </span>
            <span
              className={
                'flex-1 min-w-0 text-foreground ' +
                (wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-hidden text-ellipsis')
              }
            >
              {row.line}
            </span>
          </li>
        ))}
      </ul>
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
      });
    }
  }
  // Already sorted descending by Loki when direction=backward, but keep it
  // robust if streams were interleaved.
  out.sort((a, b) => (BigInt(b.ts) > BigInt(a.ts) ? 1 : -1));
  return out;
}

function detectLevel(labels: Record<string, string>, line: string): Level {
  const labelValue = labels['level'] ?? labels['lvl'] ?? labels['severity'] ?? labels['log_level'];
  if (labelValue) return normalizeLevel(labelValue);
  // Cheap regex heuristic.
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
