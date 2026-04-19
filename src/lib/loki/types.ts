/**
 * Loki datasource configuration + API response shapes.
 *
 * Credentials are intentionally separate from `Datasource` because their
 * lifetime is per-tier (ephemeral / session / persistent) while the metadata
 * always lives in localStorage. See PLAN §3.2.
 */

export type AuthType = 'none' | 'basic' | 'bearer';

export interface Datasource {
  /** Stable id; generated client-side (crypto.randomUUID). */
  id: string;
  /** User-visible name. */
  name: string;
  /** Base URL of the Loki (or CORS-fronting proxy), no trailing slash. */
  url: string;
  authType: AuthType;
  /** Optional `X-Scope-OrgID` — single id or pipe-separated for multi-tenant. */
  tenant?: string;
  /**
   * User opted into cookie-based auth upstream of a proxy. If true and
   * authType != 'none', live tail is allowed (WS can't set Authorization,
   * but the cookie rides along). See PLAN §3.3.
   */
  cookieAuth?: boolean;
}

export interface Credentials {
  username?: string;
  password?: string;
  token?: string;
}

export interface BuildInfo {
  version: string;
  revision?: string;
  branch?: string;
  buildDate?: string;
  buildUser?: string;
  goVersion?: string;
}

/**
 * Capability flags derived from `buildInfo.version` at connect time and
 * flipped off when an endpoint returns 404 / "not enabled" at runtime.
 * v0.1 floors at Loki 3.0 so the initial values are all `true`.
 */
export interface Capabilities {
  volumeRange: boolean;
  indexStats: boolean;
  formatQuery: boolean;
  labelsQueryParam: boolean;
  patterns: boolean;
  detectedFields: boolean;
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  volumeRange: true,
  indexStats: true,
  formatQuery: true,
  labelsQueryParam: true,
  patterns: false, // requires pattern_ingester, off by default
  detectedFields: true,
};

// ----- Query response shapes ----------------------------------------------

export type ResultType = 'streams' | 'matrix' | 'vector';

/** A single stream entry: [ns-timestamp, line, structuredMetadata?]. */
export type StreamValue =
  | [ts: string, line: string]
  | [ts: string, line: string, metadata: Record<string, string>];

export interface Stream {
  stream: Record<string, string>;
  values: StreamValue[];
}

export interface MatrixSeries {
  metric: Record<string, string>;
  values: Array<[ts: number, value: string]>;
}

export interface VectorSample {
  metric: Record<string, string>;
  value: [ts: number, value: string];
}

export interface LokiStats {
  summary?: {
    bytesProcessedPerSecond?: number;
    linesProcessedPerSecond?: number;
    totalBytesProcessed?: number;
    totalLinesProcessed?: number;
    execTime?: number;
    queueTime?: number;
  };
  // Ingester / store sub-objects intentionally untyped until a feature needs
  // them — avoids noise in the common case.
  [k: string]: unknown;
}

export interface QueryResponseStreams {
  status: 'success';
  data: {
    resultType: 'streams';
    result: Stream[];
    stats?: LokiStats;
  };
}

export interface QueryResponseMatrix {
  status: 'success';
  data: {
    resultType: 'matrix';
    result: MatrixSeries[];
    stats?: LokiStats;
  };
}

export interface QueryResponseVector {
  status: 'success';
  data: {
    resultType: 'vector';
    result: VectorSample[];
    stats?: LokiStats;
  };
}

export type QueryResponse =
  | QueryResponseStreams
  | QueryResponseMatrix
  | QueryResponseVector;

export interface LabelsResponse {
  status: 'success';
  data: string[];
}
