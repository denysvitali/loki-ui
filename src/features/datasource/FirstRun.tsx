import { useState } from 'react';
import { DatasourceForm } from './DatasourceForm';

export function FirstRun({ onConnected }: { onConnected: (id: string) => void }) {
  const [showSnippet, setShowSnippet] = useState(false);

  return (
    <div className="h-full grid place-items-center px-4 py-12 overflow-y-auto">
      <div className="w-full max-w-xl space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Connect a Loki datasource
          </h1>
          <p className="text-sm text-muted-foreground">
            loki-ui is a client-side SPA. Point it at any Loki instance whose
            CORS headers permit your origin.
          </p>
        </header>

        <div className="rounded-lg border border-border bg-card p-5">
          <DatasourceForm onSaved={onConnected} />
        </div>

        <div className="rounded-lg border border-border bg-card">
          <button
            type="button"
            onClick={() => setShowSnippet((v) => !v)}
            aria-expanded={showSnippet}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <span>Don't have a Loki to try? Run one in 30 seconds</span>
            <span aria-hidden className="text-subtle-foreground">
              {showSnippet ? '−' : '+'}
            </span>
          </button>
          {showSnippet && (
            <div className="px-4 pb-4 space-y-2 text-sm">
              <p className="text-muted-foreground">
                Clone the repo and run the dev stack (Loki 3.x + Caddy with
                CORS + loki-canary for synthetic logs):
              </p>
              <pre className="bg-background border border-border rounded-md p-3 overflow-x-auto text-xs font-mono text-foreground">
                {`git clone https://github.com/denysvitali/loki-ui
cd loki-ui
docker compose -f examples/docker-compose.dev.yml up -d`}
              </pre>
              <p className="text-subtle-foreground text-xs">
                Then connect above with URL{' '}
                <code className="font-mono">http://localhost:3101</code> and
                no auth. (The compose file lands in a follow-up commit — see
                PLAN.md §2.4.)
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-subtle-foreground">
          <a
            href="https://github.com/denysvitali/loki-ui/blob/main/PLAN.md"
            className="hover:text-muted-foreground underline underline-offset-4"
          >
            Plan
          </a>
          {' · '}
          <a
            href="https://github.com/denysvitali/loki-ui/blob/main/SECURITY.md"
            className="hover:text-muted-foreground underline underline-offset-4"
          >
            Security
          </a>
          {' · '}
          <a
            href="https://github.com/denysvitali/loki-ui"
            className="hover:text-muted-foreground underline underline-offset-4"
          >
            GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
