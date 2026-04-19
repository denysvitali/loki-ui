import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import uPlot, { type AlignedData } from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { LokiClient, LokiRequestError, type MatrixSeries } from '@/lib/loki';
import {
  loadCredentials,
  toDatasource,
  type StoredDatasource,
} from '@/lib/state/datasources';
import { formatStep, pickHistogramStep } from '@/lib/time/step';

interface HistogramProps {
  ds: StoredDatasource;
  query: string;
  fromNs: bigint;
  toNs: bigint;
  onZoom?: (fromNs: bigint, toNs: bigint) => void;
}

const LEVEL_COLORS: Record<string, string> = {
  error: 'var(--color-level-error)',
  warn: 'var(--color-level-warn)',
  info: 'var(--color-level-info)',
  debug: 'var(--color-level-debug)',
  unknown: 'var(--color-subtle-foreground)',
};

export function Histogram({ ds, query, fromNs, toNs, onZoom }: HistogramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rangeSec = Number((toNs - fromNs) / 1_000_000_000n);
  const step = pickHistogramStep(rangeSec, width);

  const selector = extractSelector(query);

  const client = useMemo(
    () => new LokiClient(toDatasource(ds), loadCredentials(ds.id, ds.credentialTier)),
    [ds.id, ds.url, ds.authType, ds.tenant, ds.credentialTier],
  );

  const q = useQuery<MatrixSeries[], LokiRequestError>({
    queryKey: ['volumeRange', ds.id, selector, fromNs.toString(), toNs.toString(), step],
    enabled: Boolean(selector),
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const res = await client.volumeRange(
        {
          query: selector,
          start: fromNs,
          end: toNs,
          step,
          targetLabels: ['level'],
          aggregateBy: 'series',
        },
        signal,
      );
      return res.data.result;
    },
  });

  return (
    <div className="border-b border-border px-3 py-2 flex-shrink-0">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>Log volume</span>
        <span className="text-subtle-foreground">buckets: {formatStep(step)}</span>
      </div>
      <div ref={containerRef} className="w-full h-[80px]">
        {q.isError && (
          <div className="text-xs text-subtle-foreground">
            histogram unavailable: {q.error.error.kind}
          </div>
        )}
        {!q.isError && (
          <UPlotChart
            series={q.data ?? []}
            fromMs={Number(fromNs / 1_000_000n)}
            toMs={Number(toNs / 1_000_000n)}
            width={width}
            height={80}
            onZoom={onZoom}
          />
        )}
      </div>
    </div>
  );
}

interface UPlotChartProps {
  series: MatrixSeries[];
  fromMs: number;
  toMs: number;
  width: number;
  height: number;
  onZoom?: (fromNs: bigint, toNs: bigint) => void;
}

function UPlotChart({
  series,
  fromMs,
  toMs,
  width,
  height,
  onZoom,
}: UPlotChartProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  const { data, seriesOpts } = useMemo(() => {
    const xSet = new Set<number>();
    for (const s of series) for (const v of s.values) xSet.add(v[0]);
    // Include endpoints so the chart always spans the full range.
    xSet.add(fromMs / 1000);
    xSet.add(toMs / 1000);
    const xs = [...xSet].sort((a, b) => a - b);
    const cols: number[][] = [xs];
    const opts: Array<uPlot.Series> = [{}];
    for (const s of series) {
      const levelLabel = s.metric['level'] ?? 'unknown';
      const color = LEVEL_COLORS[levelLabel.toLowerCase()] ?? LEVEL_COLORS.unknown!;
      const map = new Map<number, number>();
      for (const [t, v] of s.values) map.set(t, Number(v));
      cols.push(xs.map((x) => map.get(x) ?? 0));
      opts.push({
        label: levelLabel,
        stroke: color,
        fill: color,
        paths: uPlot.paths.bars!({ size: [0.9, 100] }),
        points: { show: false },
      });
    }
    return { data: cols as AlignedData, seriesOpts: opts };
  }, [series, fromMs, toMs]);

  useEffect(() => {
    if (!targetRef.current || width < 50) return;

    const opts: uPlot.Options = {
      width,
      height,
      padding: [4, 4, 0, 0],
      scales: {
        x: { time: true, min: fromMs / 1000, max: toMs / 1000 },
        y: { range: (_u, _min, max) => [0, Math.max(1, max || 1)] },
      },
      axes: [
        {
          stroke: 'var(--color-subtle-foreground)',
          grid: { show: false },
          ticks: { show: false },
          size: 18,
          font: '10px ui-monospace, monospace',
        },
        {
          stroke: 'var(--color-subtle-foreground)',
          grid: { stroke: 'var(--color-border)', width: 1 },
          ticks: { show: false },
          size: 30,
          font: '10px ui-monospace, monospace',
        },
      ],
      series: seriesOpts,
      legend: { show: false },
      cursor: {
        points: { show: false },
        drag: { x: true, y: false, setScale: false },
      },
      hooks: onZoom
        ? {
            setSelect: [
              (u) => {
                if (u.select.width > 2) {
                  const xMin = u.posToVal(u.select.left, 'x');
                  const xMax = u.posToVal(u.select.left + u.select.width, 'x');
                  onZoom(
                    BigInt(Math.round(xMin * 1000)) * 1_000_000n,
                    BigInt(Math.round(xMax * 1000)) * 1_000_000n,
                  );
                }
              },
            ],
          }
        : {},
    };

    plotRef.current = new uPlot(opts, data, targetRef.current);
    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]); // rebuild on resize only

  useEffect(() => {
    plotRef.current?.setData(data);
  }, [data]);

  useEffect(() => {
    plotRef.current?.setScale('x', { min: fromMs / 1000, max: toMs / 1000 });
  }, [fromMs, toMs]);

  return <div ref={targetRef} />;
}

/**
 * Pull the stream-selector portion of a LogQL query.
 * Volume endpoints accept only a selector (no filters/parsers).
 */
function extractSelector(query: string): string {
  const m = /^\s*(\{[^}]*\})/.exec(query);
  return m ? m[1]! : '';
}
