/**
 * Histogram bucket-width selection.
 *
 * Snap up to the next value in a fixed ladder of friendly seconds so
 * bucket boundaries align with wall-clock-natural moments and don't
 * flicker under small range changes. See PLAN §4.6.
 */

const FRIENDLY_STEPS_SECONDS = [
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600,
  43200, 86400,
];

export function pickHistogramStep(
  rangeSeconds: number,
  chartWidthPx: number,
): number {
  const targetBuckets = Math.min(200, Math.max(60, Math.floor(chartWidthPx / 5)));
  const ideal = rangeSeconds / targetBuckets;
  const snapped =
    FRIENDLY_STEPS_SECONDS.find((s) => s >= ideal) ??
    FRIENDLY_STEPS_SECONDS[FRIENDLY_STEPS_SECONDS.length - 1]!;
  return Math.max(1, Math.min(86400, snapped));
}

export function formatStep(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
