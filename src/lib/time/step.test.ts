import { describe, expect, it } from 'vitest';
import { formatStep, pickHistogramStep } from './step';

describe('pickHistogramStep', () => {
  it('always returns a friendly step', () => {
    const friendly = new Set([
      1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800,
      21600, 43200, 86400,
    ]);
    for (const r of [60, 900, 3600, 86400, 604800]) {
      const s = pickHistogramStep(r, 800);
      expect(friendly.has(s)).toBe(true);
    }
  });

  it('never asks Loki for more buckets than target by snapping up', () => {
    // 15m / 150 buckets = 6s ideal → must snap up to 10s or higher
    const s = pickHistogramStep(15 * 60, 800);
    expect(s).toBeGreaterThanOrEqual(6);
  });

  it('uses 1d buckets for year-long ranges (and never more)', () => {
    expect(pickHistogramStep(365 * 86400, 800)).toBe(86400);
    expect(pickHistogramStep(10 * 365 * 86400, 800)).toBe(86400);
  });

  it('is stable (same range → same step) on narrow width changes', () => {
    expect(pickHistogramStep(3600, 780)).toBe(pickHistogramStep(3600, 820));
  });
});

describe('formatStep', () => {
  it('renders friendly human strings', () => {
    expect(formatStep(30)).toBe('30s');
    expect(formatStep(60)).toBe('1m');
    expect(formatStep(3600)).toBe('1h');
    expect(formatStep(86400)).toBe('1d');
  });
});
