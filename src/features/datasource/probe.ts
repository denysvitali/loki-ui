import {
  LokiClient,
  LokiRequestError,
  type BuildInfo,
  type Credentials,
  type Datasource,
  type LokiError,
} from '@/lib/loki';

export interface ProbeSuccess {
  ok: true;
  buildInfo: BuildInfo;
}
export interface ProbeFailure {
  ok: false;
  error: LokiError;
}
export type ProbeResult = ProbeSuccess | ProbeFailure;

/**
 * Probes a datasource by calling /ready then /status/buildinfo.
 * Used by the connect flow before saving, and to refresh version in the UI.
 */
export async function probeDatasource(
  ds: Datasource,
  creds: Credentials,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const client = new LokiClient(ds, creds);
  try {
    await client.ready(signal);
    const buildInfo = await client.buildInfo(signal);
    return { ok: true, buildInfo };
  } catch (err) {
    if (err instanceof LokiRequestError) {
      return { ok: false, error: err.error };
    }
    return {
      ok: false,
      error: {
        kind: 'parse',
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
