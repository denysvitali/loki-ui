import { useEffect, useState } from 'react';
import { AppShell } from '@/app/AppShell';
import { QueryProvider } from '@/app/QueryProvider';
import { FirstRun } from '@/features/datasource/FirstRun';
import { DatasourceModal } from '@/features/datasource/DatasourceModal';
import { Explore } from '@/features/explore/Explore';
import { migrate } from '@/lib/state/datasources';
import {
  useActiveDatasource,
  useDatasourceList,
} from '@/lib/state/useDatasources';
import type { StoredDatasource } from '@/lib/state/datasources';

export function App() {
  useEffect(() => {
    migrate();
  }, []);

  return (
    <QueryProvider>
      <Routes />
    </QueryProvider>
  );
}

function Routes() {
  const datasources = useDatasourceList();
  const active = useActiveDatasource();
  const [modal, setModal] = useState<
    | { kind: 'closed' }
    | { kind: 'add' }
    | { kind: 'edit'; ds: StoredDatasource }
  >({ kind: 'closed' });

  if (datasources.length === 0) {
    return (
      <AppShell sidebar={<SidebarPlaceholder />}>
        <FirstRun onConnected={() => { /* storage drives re-render */ }} />
      </AppShell>
    );
  }

  return (
    <>
      <AppShell
        sidebar={<SidebarPlaceholder />}
        onAdd={() => setModal({ kind: 'add' })}
        onEdit={(ds) => setModal({ kind: 'edit', ds })}
      >
        {active ? (
          <Explore ds={active} />
        ) : (
          <div className="h-full grid place-items-center text-muted-foreground">
            Select a datasource.
          </div>
        )}
      </AppShell>

      {modal.kind === 'add' && (
        <DatasourceModal
          onClose={() => setModal({ kind: 'closed' })}
          onSaved={() => setModal({ kind: 'closed' })}
        />
      )}
      {modal.kind === 'edit' && (
        <DatasourceModal
          existing={modal.ds}
          onClose={() => setModal({ kind: 'closed' })}
          onSaved={() => setModal({ kind: 'closed' })}
        />
      )}
    </>
  );
}

function SidebarPlaceholder() {
  return (
    <div className="p-4 text-sm text-muted-foreground">
      <div className="uppercase tracking-wider text-xs text-subtle-foreground mb-2">
        Labels
      </div>
      <p className="text-subtle-foreground">
        Label browser lands in the next commit.
      </p>
    </div>
  );
}
