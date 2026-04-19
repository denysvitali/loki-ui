import { useEffect, useState } from 'react';
import { toDatasource } from '@/lib/state/datasources';
import { loadCredentials } from '@/lib/state/datasources';
import { probeDatasource } from '@/features/datasource/probe';
import type { StoredDatasource } from '@/lib/state/datasources';
import type { BuildInfo } from '@/lib/loki';
import { describe as describeError } from '@/lib/loki';

export function ExplorePlaceholder({ ds }: { ds: StoredDatasource }) {
  const [state, setState] = useState<
    | { status: 'probing' }
    | { status: 'ok'; info: BuildInfo }
    | { status: 'error'; error: string }
  >({ status: 'probing' });

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      const result = await probeDatasource(
        toDatasource(ds),
        loadCredentials(ds.id, ds.credentialTier),
        ac.signal,
      );
      if (ac.signal.aborted) return;
      if (result.ok) setState({ status: 'ok', info: result.buildInfo });
      else setState({ status: 'error', error: describeError(result.error) });
    })();
    return () => ac.abort();
  }, [ds.id, ds.url, ds.authType, ds.tenant, ds.credentialTier]);

  return (
    <div className="h-full grid place-items-center px-6 py-16">
      <div className="max-w-xl text-center space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground tracking-wide">
          <span className="size-1.5 rounded-full bg-accent animate-pulse" />
          explore — coming next
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Connected to {ds.name}
        </h1>
        <div className="text-sm text-muted-foreground">
          <div className="font-mono">{ds.url}</div>
          <div className="mt-2">
            {state.status === 'probing' && 'Probing…'}
            {state.status === 'ok' && (
              <span>
                Loki{' '}
                <span className="text-foreground font-mono">
                  {state.info.version}
                </span>
                {state.info.revision && (
                  <span className="text-subtle-foreground">
                    {' '}
                    · {state.info.revision.slice(0, 7)}
                  </span>
                )}
              </span>
            )}
            {state.status === 'error' && (
              <span className="text-[var(--color-level-error)]">
                {state.error}
              </span>
            )}
          </div>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          The log explorer (editor, histogram, virtualized viewer, live tail,
          label browser) lands in the next few commits. This placeholder will
          become the real Explore page.
        </p>
      </div>
    </div>
  );
}
