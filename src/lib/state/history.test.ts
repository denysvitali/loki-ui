import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearHistory,
  readHistory,
  recordHistory,
} from './history';

beforeEach(() => {
  localStorage.clear();
});

describe('history', () => {
  it('starts empty', () => {
    expect(readHistory('ds1')).toEqual([]);
  });

  it('records queries in reverse chronological order', () => {
    recordHistory('ds1', { query: '{a="1"}', from: 'now-1h', to: 'now' });
    recordHistory('ds1', { query: '{a="2"}', from: 'now-1h', to: 'now' });
    const h = readHistory('ds1');
    expect(h).toHaveLength(2);
    expect(h[0]!.query).toBe('{a="2"}');
    expect(h[1]!.query).toBe('{a="1"}');
  });

  it('deduplicates consecutive identical queries and updates timestamp', () => {
    recordHistory('ds1', { query: '{a="1"}', from: 'now-1h', to: 'now' });
    const firstAt = readHistory('ds1')[0]!.at;
    // Delay trivially to ensure timestamps differ
    const later = firstAt + 1000;
    vi.setSystemTime(later);
    recordHistory('ds1', {
      query: '{a="1"}',
      from: 'now-1h',
      to: 'now',
      execMs: 42,
    });
    const h = readHistory('ds1');
    expect(h).toHaveLength(1);
    expect(h[0]!.execMs).toBe(42);
    expect(h[0]!.at).toBe(later);
    vi.useRealTimers();
  });

  it('is per-datasource', () => {
    recordHistory('ds1', { query: '{a="1"}', from: 'now-1h', to: 'now' });
    recordHistory('ds2', { query: '{b="2"}', from: 'now-1h', to: 'now' });
    expect(readHistory('ds1')).toHaveLength(1);
    expect(readHistory('ds2')).toHaveLength(1);
    expect(readHistory('ds1')[0]!.query).toBe('{a="1"}');
  });

  it('caps at 200 entries', () => {
    for (let i = 0; i < 250; i++) {
      recordHistory('ds1', {
        query: `{a="${i}"}`,
        from: 'now-1h',
        to: 'now',
      });
    }
    expect(readHistory('ds1')).toHaveLength(200);
    expect(readHistory('ds1')[0]!.query).toBe('{a="249"}');
  });

  it('ignores empty queries', () => {
    recordHistory('ds1', { query: '   ', from: 'now-1h', to: 'now' });
    expect(readHistory('ds1')).toEqual([]);
  });

  it('clearHistory wipes one datasource', () => {
    recordHistory('ds1', { query: '{a="1"}', from: 'now-1h', to: 'now' });
    clearHistory('ds1');
    expect(readHistory('ds1')).toEqual([]);
  });
});

// vi import for fake timers
import { vi } from 'vitest';
