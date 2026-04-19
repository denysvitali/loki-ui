import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DatasourcePicker } from '@/features/datasource/DatasourcePicker';
import type { StoredDatasource } from '@/lib/state/datasources';

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  onAdd?: () => void;
  onEdit?: (ds: StoredDatasource) => void;
}

export function AppShell({ sidebar, children, onAdd, onEdit }: AppShellProps) {
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <TopBar onAdd={onAdd} onEdit={onEdit} />
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

interface TopBarProps {
  onAdd?: () => void;
  onEdit?: (ds: StoredDatasource) => void;
}

function TopBar({ onAdd, onEdit }: TopBarProps) {
  return (
    <header className="h-12 shrink-0 border-b border-border bg-card/60 backdrop-blur flex items-center px-4 gap-3">
      <Brand />
      <div className="flex-1" />
      {onAdd && onEdit ? (
        <DatasourcePicker onAdd={onAdd} onEdit={onEdit} />
      ) : (
        <DatasourcePickerStub />
      )}
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
    <span
      className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-background text-sm text-subtle-foreground"
      title="No datasource yet"
    >
      <span className="size-1.5 rounded-full bg-subtle-foreground" />
      no datasource
    </span>
  );
}
