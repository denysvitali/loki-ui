import { describe, expect, it, vi } from 'vitest';
import { LokiClient } from './client';
import { LokiRequestError } from './errors';
import type { Datasource } from './types';

const baseDs = (overrides: Partial<Datasource> = {}): Datasource => ({
  id: 'test',
  name: 'Test',
  url: 'http://loki.test:3100',
  authType: 'none',
  ...overrides,
});

function jsonRes(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function textRes(status: number, body: string, headers?: Record<string, string>) {
  return new Response(body, { status, headers });
}

describe('LokiClient — auth headers', () => {
  it('no auth sets no Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    const c = new LokiClient(baseDs(), {}, fetchMock as unknown as typeof fetch);
    await c.buildInfo();
    const headers = fetchMock.mock.calls[0]![1]!.headers as Headers;
    expect(headers.has('authorization')).toBe(false);
  });

  it('basic auth sets base64(user:pass)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    const c = new LokiClient(
      baseDs({ authType: 'basic' }),
      { username: 'alice', password: 's3cret' },
      fetchMock as unknown as typeof fetch,
    );
    await c.buildInfo();
    const headers = fetchMock.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get('authorization')).toBe(
      `Basic ${btoa('alice:s3cret')}`,
    );
  });

  it('bearer auth sets token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    const c = new LokiClient(
      baseDs({ authType: 'bearer' }),
      { token: 'abc.def' },
      fetchMock as unknown as typeof fetch,
    );
    await c.buildInfo();
    const headers = fetchMock.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer abc.def');
  });

  it('tenant sets X-Scope-OrgID (combinable with auth)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    const c = new LokiClient(
      baseDs({ authType: 'bearer', tenant: 'team-a|team-b' }),
      { token: 't' },
      fetchMock as unknown as typeof fetch,
    );
    await c.buildInfo();
    const headers = fetchMock.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get('x-scope-orgid')).toBe('team-a|team-b');
    expect(headers.get('authorization')).toBe('Bearer t');
  });
});

describe('LokiClient — error mapping', () => {
  it('401 → auth error through LokiRequestError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textRes(401, 'unauthorized'));
    const c = new LokiClient(baseDs(), {}, fetchMock as unknown as typeof fetch);
    await expect(c.buildInfo()).rejects.toBeInstanceOf(LokiRequestError);
    try {
      await c.buildInfo();
    } catch (err) {
      expect((err as LokiRequestError).error.kind).toBe('auth');
    }
  });

  it('AbortError → cancelled', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const c = new LokiClient(baseDs(), {}, fetchMock as unknown as typeof fetch);
    try {
      await c.buildInfo();
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as LokiRequestError).error.kind).toBe('cancelled');
    }
  });

  it('TypeError when online → network (CORS is inferred at UI layer)', async () => {
    const origOnLine = Object.getOwnPropertyDescriptor(
      Navigator.prototype,
      'onLine',
    );
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const c = new LokiClient(baseDs(), {}, fetchMock as unknown as typeof fetch);
    try {
      await c.buildInfo();
      expect.fail('should have thrown');
    } catch (err) {
      const e = (err as LokiRequestError).error;
      expect(e.kind).toBe('network');
      if (e.kind === 'network') expect(e.online).toBe(true);
    }
    if (origOnLine) Object.defineProperty(navigator, 'onLine', origOnLine);
  });
});

describe('LokiClient — 429 retry', () => {
  it('retries once on 429 with small Retry-After', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textRes(429, 'rate limited', { 'retry-after': '1' }))
      .mockResolvedValueOnce(jsonRes(200, { version: '3.5.0' }));
    const c = new LokiClient(baseDs(), {}, fetchMock as unknown as typeof fetch);
    const info = await c.buildInfo();
    expect(info).toEqual({ version: '3.5.0' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('does not retry when Retry-After > 5s', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(textRes(429, 'rate limited', { 'retry-after': '60' }));
    const c = new LokiClient(baseDs(), {}, fetchMock as unknown as typeof fetch);
    try {
      await c.buildInfo();
      expect.fail('should have thrown');
    } catch (err) {
      const e = (err as LokiRequestError).error;
      expect(e.kind).toBe('rate-limit');
      if (e.kind === 'rate-limit') expect(e.retryAfter).toBe(60);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('LokiClient — mixed content guard', () => {
  it('blocks http upstream from https page before fetch', async () => {
    const loc = window.location;
    // happy-dom: window.location is writable enough for this
    Object.defineProperty(window, 'location', {
      value: { ...loc, protocol: 'https:' },
      configurable: true,
    });
    const fetchMock = vi.fn();
    const c = new LokiClient(
      baseDs({ url: 'http://insecure-loki:3100' }),
      {},
      fetchMock as unknown as typeof fetch,
    );
    try {
      await c.buildInfo();
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as LokiRequestError).error.kind).toBe('mixed-content');
    }
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(window, 'location', { value: loc, configurable: true });
  });
});

describe('LokiClient — URL trimming', () => {
  it('strips trailing slashes from base URL', () => {
    const c = new LokiClient(baseDs({ url: 'http://loki:3100/' }));
    expect(c.base).toBe('http://loki:3100');
    const c2 = new LokiClient(baseDs({ url: 'http://loki:3100///' }));
    expect(c2.base).toBe('http://loki:3100');
  });
});
