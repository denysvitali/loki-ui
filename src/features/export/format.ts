/**
 * Export formatters. See PLAN §4.14.
 *
 * All formats prepend self-describing `#` header lines so the output
 * round-trips "what was this?". NDJSON readers that strip '#' lines handle
 * this gracefully; plain text is obviously human-readable.
 */

import type { MatrixSeries, Stream } from '@/lib/loki';

export interface ExportContext {
  datasourceName: string;
  query: string;
  from: string;
  to: string;
}

function header(ctx: ExportContext, entries: number): string[] {
  return [
    '# loki-ui export',
    `# datasource: ${ctx.datasourceName}`,
    `# query: ${ctx.query}`,
    `# range: ${ctx.from} / ${ctx.to}`,
    `# entries: ${entries}`,
  ];
}

// ----- streams ------------------------------------------------------------

export function toNDJSON(streams: Stream[], ctx: ExportContext): string {
  const lines = header(streams.reduce((n, s) => n + s.values.length, 0) === 0 ? ctx : ctx, 0);
  // recompute with correct count
  const entries = streams.reduce((n, s) => n + s.values.length, 0);
  lines.length = 0;
  lines.push(...header(ctx, entries));
  for (const s of streams) {
    for (const v of s.values) {
      const ts = v[0];
      const line = v[1];
      const metadata = v.length === 3 ? v[2] : undefined;
      const iso = new Date(Number(BigInt(ts) / 1_000_000n)).toISOString();
      const row: Record<string, unknown> = {
        ts,
        iso,
        labels: s.stream,
        line,
      };
      if (metadata && Object.keys(metadata).length > 0) row.metadata = metadata;
      lines.push(JSON.stringify(row));
    }
  }
  return lines.join('\n') + '\n';
}

export function toPlainText(streams: Stream[], ctx: ExportContext): string {
  const entries = streams.reduce((n, s) => n + s.values.length, 0);
  const out: string[] = header(ctx, entries);
  const rows: Array<{ ts: bigint; iso: string; labels: string; line: string }> = [];
  for (const s of streams) {
    const labelsStr = Object.entries(s.stream)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    for (const v of s.values) {
      const ts = BigInt(v[0]);
      const iso = new Date(Number(ts / 1_000_000n)).toISOString();
      const line = v[1].replace(/\n/g, '\t\t');
      rows.push({ ts, iso, labels: labelsStr, line });
    }
  }
  rows.sort((a, b) => (b.ts > a.ts ? 1 : -1));
  for (const r of rows) {
    out.push(`${r.iso}  ${r.labels}  ${r.line}`);
  }
  return out.join('\n') + '\n';
}

// ----- matrix -------------------------------------------------------------

export function matrixToNDJSON(series: MatrixSeries[], ctx: ExportContext): string {
  const points = series.reduce((n, s) => n + s.values.length, 0);
  const lines = header(ctx, points);
  for (const s of series) {
    for (const [ts, val] of s.values) {
      lines.push(
        JSON.stringify({
          ts,
          iso: new Date(ts * 1000).toISOString(),
          metric: s.metric,
          value: Number(val),
        }),
      );
    }
  }
  return lines.join('\n') + '\n';
}

export function matrixToCSV(series: MatrixSeries[], ctx: ExportContext): string {
  const points = series.reduce((n, s) => n + s.values.length, 0);
  const out = header(ctx, points);
  // Union of all timestamps (asc) across all series.
  const xs = new Set<number>();
  for (const s of series) for (const [t] of s.values) xs.add(t);
  const xArr = [...xs].sort((a, b) => a - b);

  const headers = [
    'timestamp',
    ...series.map((s) => seriesLabel(s.metric)),
  ];
  out.push(headers.map(csvEscape).join(','));

  for (const t of xArr) {
    const row: string[] = [new Date(t * 1000).toISOString()];
    for (const s of series) {
      const match = s.values.find(([x]) => x === t);
      row.push(match ? match[1] : '');
    }
    out.push(row.map(csvEscape).join(','));
  }
  return out.join('\n') + '\n';
}

function seriesLabel(metric: Record<string, string>): string {
  const parts = Object.entries(metric)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`);
  return `{${parts.join(',')}}`;
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

// ----- download helper ----------------------------------------------------

export function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFilename(
  datasourceName: string,
  ext: 'ndjson' | 'txt' | 'csv',
): string {
  const safe = datasourceName.replace(/[^a-z0-9._-]+/gi, '_');
  return `loki-ui-${safe}-${Math.floor(Date.now() / 1000)}.${ext}`;
}
