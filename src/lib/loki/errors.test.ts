import { describe, expect, it } from 'vitest';
import { classifyHttpError, describe as describeErr } from './errors';

describe('classifyHttpError', () => {
  it('401 / 403 → auth', () => {
    const e = classifyHttpError(401, 'Unauthorized');
    expect(e.kind).toBe('auth');
    if (e.kind === 'auth') expect(e.status).toBe(401);
  });

  it('401 with "no org id" → tenant-missing', () => {
    expect(classifyHttpError(401, 'no org id found in context').kind).toBe(
      'tenant-missing',
    );
    expect(classifyHttpError(401, 'tenant id required').kind).toBe(
      'tenant-missing',
    );
  });

  it('429 uses Retry-After', () => {
    const e = classifyHttpError(429, 'too many requests', '7');
    expect(e.kind).toBe('rate-limit');
    if (e.kind === 'rate-limit') expect(e.retryAfter).toBe(7);
  });

  it('429 with invalid Retry-After defaults to 1s', () => {
    const e = classifyHttpError(429, 'rate limited', 'abc');
    if (e.kind === 'rate-limit') expect(e.retryAfter).toBe(1);
  });

  it('400 with LogQL parse error extracts line:col', () => {
    const body = 'parse error at line 3, col 12: unexpected identifier';
    const e = classifyHttpError(400, body);
    expect(e.kind).toBe('logql');
    if (e.kind === 'logql') {
      expect(e.line).toBe(3);
      expect(e.col).toBe(12);
    }
  });

  it('400 with context deadline → timeout', () => {
    const e = classifyHttpError(400, 'context deadline exceeded');
    expect(e.kind).toBe('timeout');
  });

  it('400 with max series → limit', () => {
    const e = classifyHttpError(400, 'max series limit reached');
    expect(e.kind).toBe('limit');
  });

  it('503 / 504 → timeout', () => {
    expect(classifyHttpError(503, 'upstream unavailable').kind).toBe('timeout');
    expect(classifyHttpError(504, 'gateway timeout').kind).toBe('timeout');
  });

  it('other 5xx → server', () => {
    const e = classifyHttpError(500, 'boom');
    expect(e.kind).toBe('server');
    if (e.kind === 'server') expect(e.status).toBe(500);
  });

  it('truncates very large bodies', () => {
    const body = 'x'.repeat(10_000);
    const e = classifyHttpError(500, body);
    if (e.kind === 'server' && e.body) expect(e.body.length).toBe(500);
  });
});

describe('describe', () => {
  it('produces a one-line string for every kind', () => {
    const samples = [
      { kind: 'cors', url: 'http://x' },
      { kind: 'mixed-content', url: 'http://x' },
      { kind: 'network', online: false },
      { kind: 'auth', status: 401 },
      { kind: 'tenant-missing' },
      { kind: 'logql', message: 'oops', line: 1, col: 2 },
      { kind: 'timeout', message: 'deadline' },
      { kind: 'limit', limit: 'max series', message: 'too many' },
      { kind: 'rate-limit', retryAfter: 3 },
      { kind: 'feature-absent', feature: 'volumeRange' },
      { kind: 'cancelled' },
      { kind: 'parse', detail: 'unexpected token' },
      { kind: 'server', status: 500 },
    ] as const;
    for (const e of samples) {
      const s = describeErr(e);
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });
});
