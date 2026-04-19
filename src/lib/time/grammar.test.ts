import { describe, expect, it } from 'vitest';
import { parseTime, resolveRange, resolveToNs } from './grammar';

const NOW = new Date('2026-04-19T12:00:00Z');

describe('parseTime', () => {
  it('accepts now and offsets', () => {
    expect(parseTime('now').kind).toBe('relative');
    expect(parseTime('now-15m').kind).toBe('relative');
    expect(parseTime('now+1h').kind).toBe('relative');
    expect(parseTime('now/d').kind).toBe('relative');
    expect(parseTime('now/d-1h').kind).toBe('relative');
  });

  it('accepts ISO-8601 absolute', () => {
    expect(parseTime('2026-04-19T12:00:00Z').kind).toBe('absolute');
    expect(parseTime('2026-04-19').kind).toBe('absolute');
    expect(parseTime('2026-04-19 12:00:00').kind).toBe('absolute');
  });

  it('accepts bare ns epoch', () => {
    expect(parseTime('1713484800123456789').kind).toBe('absolute');
  });

  it('rejects garbage', () => {
    expect(() => parseTime('')).toThrow();
    expect(() => parseTime('yesterday')).toThrow();
    expect(() => parseTime('now-15x')).toThrow(); // `x` not a unit, but regex would match — guard via full-parse
  });
});

describe('resolveToNs — relative', () => {
  it('now resolves to current instant', () => {
    const ns = resolveToNs(parseTime('now'), NOW, 'UTC');
    expect(ns).toBe(BigInt(NOW.getTime()) * 1_000_000n);
  });

  it('now-15m is 15 minutes earlier', () => {
    const ns = resolveToNs(parseTime('now-15m'), NOW, 'UTC');
    expect(ns).toBe(BigInt(NOW.getTime() - 15 * 60_000) * 1_000_000n);
  });

  it('now+1h is 1 hour later', () => {
    const ns = resolveToNs(parseTime('now+1h'), NOW, 'UTC');
    expect(ns).toBe(BigInt(NOW.getTime() + 3_600_000) * 1_000_000n);
  });

  it('now/d in UTC snaps to today 00:00 UTC', () => {
    const ns = resolveToNs(parseTime('now/d'), NOW, 'UTC');
    expect(new Date(Number(ns / 1_000_000n)).toISOString()).toBe(
      '2026-04-19T00:00:00.000Z',
    );
  });

  it('now/d-1d yields yesterday 00:00 in timezone', () => {
    const ns = resolveToNs(parseTime('now/d-1d'), NOW, 'UTC');
    expect(new Date(Number(ns / 1_000_000n)).toISOString()).toBe(
      '2026-04-18T00:00:00.000Z',
    );
  });

  it('now/h snaps to top of hour', () => {
    const t = new Date('2026-04-19T12:37:22Z');
    const ns = resolveToNs(parseTime('now/h'), t, 'UTC');
    expect(new Date(Number(ns / 1_000_000n)).toISOString()).toBe(
      '2026-04-19T12:00:00.000Z',
    );
  });

  it('now-1M subtracts a month', () => {
    const ns = resolveToNs(parseTime('now-1M'), NOW, 'UTC');
    expect(new Date(Number(ns / 1_000_000n)).toISOString()).toBe(
      '2026-03-19T12:00:00.000Z',
    );
  });
});

describe('resolveToNs — absolute', () => {
  it('ISO with Z is exact', () => {
    const ns = resolveToNs(parseTime('2026-04-19T12:00:00Z'), NOW, 'UTC');
    expect(ns).toBe(BigInt(Date.UTC(2026, 3, 19, 12)) * 1_000_000n);
  });

  it('bare ns epoch passes through', () => {
    const ns = resolveToNs(parseTime('1713484800123456789'), NOW, 'UTC');
    expect(ns).toBe(1713484800123456789n);
  });
});

describe('resolveRange', () => {
  it('valid range returns (fromNs, toNs)', () => {
    const { fromNs, toNs } = resolveRange('now-1h', 'now', NOW, 'UTC');
    expect(toNs - fromNs).toBe(3_600n * 1_000_000_000n);
  });

  it('rejects from > to', () => {
    expect(() => resolveRange('now', 'now-1h', NOW, 'UTC')).toThrow();
  });
});
