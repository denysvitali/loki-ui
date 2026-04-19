import type { BuildInfo, Credentials, Datasource } from './types';
import {
  LokiRequestError,
  classifyHttpError,
  type LokiError,
} from './errors';

/**
 * Typed Loki client. One instance per (datasource, credentials) tuple.
 * All methods accept an optional AbortSignal; cancellation surfaces as
 * a LokiRequestError of kind 'cancelled'.
 *
 * This module is intentionally UI-free — it's imported by features, tests,
 * and any future non-browser consumer (MSW handlers during tests).
 */
export class LokiClient {
  readonly base: string;
  private readonly ds: Datasource;
  private readonly creds: Credentials;
  /** `fetch` is injected so tests can substitute without MSW if they want. */
  private readonly fetchImpl: typeof fetch;

  constructor(
    ds: Datasource,
    creds: Credentials = {},
    fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.ds = ds;
    this.creds = creds;
    this.base = ds.url.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  async ready(signal?: AbortSignal): Promise<void> {
    const res = await this.request('/ready', {}, signal);
    if (!res.ok) {
      const body = await safeText(res);
      throw new LokiRequestError(
        classifyHttpError(res.status, body, res.headers.get('retry-after')),
      );
    }
  }

  async buildInfo(signal?: AbortSignal): Promise<BuildInfo> {
    return this.getJson<BuildInfo>('/loki/api/v1/status/buildinfo', signal);
  }

  // ----- internals --------------------------------------------------------

  private async getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await this.request(path, {}, signal);
    if (!res.ok) {
      const body = await safeText(res);
      throw new LokiRequestError(
        classifyHttpError(res.status, body, res.headers.get('retry-after')),
      );
    }
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new LokiRequestError({
        kind: 'parse',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Issue a request, normalizing errors into LokiRequestError:
   *  - AbortError → cancelled
   *  - Mixed-content (https page → http upstream) short-circuited before fetch
   *  - TypeError with navigator.onLine → network | cors
   *  - Single automatic retry on 429 honouring Retry-After
   */
  private async request(
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    const url = this.base + path;

    if (isMixedContent(url)) {
      throw new LokiRequestError({ kind: 'mixed-content', url });
    }

    const headers = new Headers(init.headers);
    this.applyAuthHeaders(headers);
    if (!headers.has('accept')) headers.set('accept', 'application/json');

    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, headers, signal });
    } catch (err) {
      if (isAbortError(err)) {
        throw new LokiRequestError({ kind: 'cancelled' });
      }
      throw new LokiRequestError(classifyFetchFailure(err, url));
    }

    // One transparent retry on 429 if Retry-After is small and we're not cancelled
    if (res.status === 429) {
      const ra = parseInt(res.headers.get('retry-after') ?? '1', 10);
      if (Number.isFinite(ra) && ra > 0 && ra <= 5 && !signal?.aborted) {
        await sleep(ra * 1000, signal);
        try {
          res = await this.fetchImpl(url, { ...init, headers, signal });
        } catch (err) {
          if (isAbortError(err)) {
            throw new LokiRequestError({ kind: 'cancelled' });
          }
          throw new LokiRequestError(classifyFetchFailure(err, url));
        }
      }
    }

    return res;
  }

  private applyAuthHeaders(headers: Headers) {
    switch (this.ds.authType) {
      case 'basic': {
        const user = this.creds.username ?? '';
        const pass = this.creds.password ?? '';
        if (user || pass) {
          headers.set('authorization', `Basic ${b64(`${user}:${pass}`)}`);
        }
        break;
      }
      case 'bearer': {
        if (this.creds.token) {
          headers.set('authorization', `Bearer ${this.creds.token}`);
        }
        break;
      }
      case 'none':
        break;
    }
    if (this.ds.tenant) {
      headers.set('x-scope-orgid', this.ds.tenant);
    }
  }
}

// ----- helpers ------------------------------------------------------------

function isMixedContent(url: string): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  if (window.location.protocol !== 'https:') return false;
  try {
    return new URL(url).protocol === 'http:';
  } catch {
    return false;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function classifyFetchFailure(err: unknown, _url: string): LokiError {
  const online =
    typeof navigator !== 'undefined' ? (navigator.onLine ?? true) : true;

  // Browsers hide CORS vs network vs DNS behind a generic TypeError.
  // Our heuristic: if we're online, it's most likely CORS for a URL we
  // could otherwise reach. A more accurate probe (opaque <img>) is added
  // at the UI layer; here we err on the side of 'network' and let the UI
  // escalate to the CORS diagnostic if probing confirms.
  if (err instanceof TypeError) {
    return online
      ? { kind: 'network', online, cause: err.message }
      : { kind: 'network', online: false };
  }

  const cause = err instanceof Error ? err.message : String(err);
  return { kind: 'network', online, cause };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function b64(s: string): string {
  if (typeof btoa === 'function') return btoa(s);
  // Node / tests
  return Buffer.from(s, 'utf-8').toString('base64');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
