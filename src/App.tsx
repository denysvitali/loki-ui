import { AppShell } from '@/app/AppShell';

export function App() {
  return (
    <AppShell sidebar={<SidebarPlaceholder />}>
      <ExplorePlaceholder />
    </AppShell>
  );
}

function SidebarPlaceholder() {
  return (
    <div className="p-4 text-sm text-muted-foreground">
      <div className="uppercase tracking-wider text-xs text-subtle-foreground mb-2">
        Labels
      </div>
      <p className="text-subtle-foreground">
        Label browser lands after the Loki client and datasource flow.
      </p>
    </div>
  );
}

function ExplorePlaceholder() {
  return (
    <div className="h-full grid place-items-center px-6 py-16">
      <div className="max-w-xl text-center space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground tracking-wide">
          <span className="size-1.5 rounded-full bg-accent animate-pulse" />
          scaffolding
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          A better frontend for Grafana Loki
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          Static SPA on GitHub Pages. No backend. Points at any Loki you
          configure. Up next: Loki client, datasource flow, explore UI.
        </p>
        <div className="flex items-center justify-center gap-3 text-sm">
          <a
            className="text-accent hover:underline underline-offset-4"
            href="https://github.com/denysvitali/loki-ui"
          >
            GitHub
          </a>
          <span className="text-subtle-foreground">·</span>
          <a
            className="text-accent hover:underline underline-offset-4"
            href="https://github.com/denysvitali/loki-ui/blob/main/PLAN.md"
          >
            Plan
          </a>
          <span className="text-subtle-foreground">·</span>
          <a
            className="text-accent hover:underline underline-offset-4"
            href="https://github.com/denysvitali/loki-ui/blob/main/ROADMAP.md"
          >
            Roadmap
          </a>
        </div>
      </div>
    </div>
  );
}
