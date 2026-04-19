import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <aside
          className="w-[280px] shrink-0 border-r border-border bg-card hidden md:block"
          aria-label="Label browser"
        >
          {sidebar}
        </aside>
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <header className="h-12 shrink-0 border-b border-border bg-card/60 backdrop-blur flex items-center px-4 gap-3">
      <Brand />
      <div className="flex-1" />
      <DatasourcePickerStub />
      <ThemeToggle />
    </header>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 select-none">
      <span
        className="inline-flex items-center justify-center size-6 rounded-md bg-muted font-mono text-[13px] font-semibold text-accent"
        aria-hidden
      >
        {'{}'}
      </span>
      <span className="font-semibold tracking-tight text-foreground">
        loki-ui
      </span>
      <span className="text-xs text-subtle-foreground">v0.0.0</span>
    </div>
  );
}

function DatasourcePickerStub() {
  return (
    <button
      type="button"
      disabled
      className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-background text-sm text-muted-foreground cursor-not-allowed"
      title="Datasource management coming next"
    >
      <span className="size-1.5 rounded-full bg-subtle-foreground" />
      no datasource
    </button>
  );
}
