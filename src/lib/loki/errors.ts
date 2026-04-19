/**
 * Typed discriminated union for every way a Loki request can fail.
 * Presentation is decided by a central renderer keyed on `kind` — no
 * feature decides its own error UI. See PLAN §4.15.
 */

import type { Capabilities } from './types';

export type LokiError =
  | { kind: 'cors'; url: string }
  | { kind: 'mixed-content'; url: string }
  | { kind: 'network'; online: boolean; cause?: string }
  | { kind: 'auth'; status: 401 | 403; body?: string }
  | { kind: 'tenant-missing' }
  | { kind: 'logql'; message: string; line?: number; col?: number }
  | { kind: 'timeout'; message: string }
  | { kind: 'limit'; limit: string; message: string }
  | { kind: 'rate-limit'; retryAfter: number }
  | { kind: 'feature-absent'; feature: keyof Capabilities } // never rendered
  | { kind: 'cancelled' } // never rendered
  | { kind: 'parse'; detail: string }
  | { kind: 'server'; status: number; body?: string };

/** Wraps a LokiError as an Error so it can flow through TanStack Query. */
export class LokiRequestError extends Error {
  readonly error: LokiError;
  constructor(error: LokiError, message?: string) {
    super(message ?? describe(error));
    this.name = 'LokiRequestError';
    this.error = error;
  }
}

/** One-line, human-readable summary. Not the full UI — just something useful in logs/devtools. */
export function describe(e: LokiError): string {
  switch (e.kind) {
    case 'cors':
      return `CORS blocked request to ${e.url}`;
    case 'mixed-content':
      return `mixed-content: cannot reach ${e.url} from an HTTPS page`;
    case 'network':
      return e.online
        ? `network error${e.cause ? `: ${e.cause}` : ''}`
        : 'offline';
    case 'auth':
      return `auth failed (${e.status})`;
    case 'tenant-missing':
      return 'X-Scope-OrgID required but not provided';
    case 'logql':
      return e.line != null
        ? `LogQL error at ${e.line}:${e.col ?? 0} — ${e.message}`
        : `LogQL error — ${e.message}`;
    case 'timeout':
      return `timeout — ${e.message}`;
    case 'limit':
      return `limit exceeded (${e.limit}) — ${e.message}`;
    case 'rate-limit':
      return `rate-limited, retry in ${e.retryAfter}s`;
    case 'feature-absent':
      return `feature ${e.feature} not available on this datasource`;
    case 'cancelled':
      return 'cancelled';
    case 'parse':
      return `parse error — ${e.detail}`;
    case 'server':
      return `server error (${e.status})`;
  }
}

/**
 * Classify a fetch Response (status + body text) into a LokiError kind for
 * 4xx/5xx paths. Network-layer classification is handled separately in the
 * client (it has access to the thrown TypeError, navigator.onLine, etc).
 */
export function classifyHttpError(
  status: number,
  body: string,
  retryAfter?: string | null,
): LokiError {
  if (status === 401 || status === 403) {
    if (/no org id|org.*id.*required|tenant/i.test(body)) {
      return { kind: 'tenant-missing' };
    }
    return { kind: 'auth', status: status as 401 | 403, body };
  }
  if (status === 429) {
    const ra = retryAfter ? parseInt(retryAfter, 10) : 1;
    return {
      kind: 'rate-limit',
      retryAfter: Number.isFinite(ra) && ra > 0 ? ra : 1,
    };
  }
  if (status === 400) {
    const logqlHint =
      /parse error|unexpected|logql|syntax error|at line (\d+), col (\d+)/i;
    if (logqlHint.test(body)) {
      const m = /at line (\d+), col (\d+)/i.exec(body);
      return {
        kind: 'logql',
        message: body.slice(0, 500),
        ...(m ? { line: Number(m[1]), col: Number(m[2]) } : {}),
      };
    }
    if (/context deadline exceeded|timeout/i.test(body)) {
      return { kind: 'timeout', message: body.slice(0, 500) };
    }
    if (/max.*(series|query|parallelism|bytes|limit)/i.test(body)) {
      const m = /(max[a-z_ ]+)/i.exec(body);
      return {
        kind: 'limit',
        limit: m?.[1] ?? 'unknown',
        message: body.slice(0, 500),
      };
    }
    return { kind: 'server', status, body: body.slice(0, 500) };
  }
  if (status === 422) {
    return {
      kind: 'limit',
      limit: 'unprocessable',
      message: body.slice(0, 500),
    };
  }
  if (status === 503 || status === 504) {
    return { kind: 'timeout', message: body.slice(0, 500) };
  }
  return { kind: 'server', status, body: body.slice(0, 500) };
}
