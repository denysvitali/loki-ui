import { useEffect, useRef, useState } from 'react';
import {
  removeDatasource,
  setActiveDatasource,
  type StoredDatasource,
} from '@/lib/state/datasources';
import {
  useActiveDatasource,
  useDatasourceList,
} from '@/lib/state/useDatasources';

interface DatasourcePickerProps {
  onAdd: () => void;
  onEdit: (ds: StoredDatasource) => void;
}

export function DatasourcePicker({ onAdd, onEdit }: DatasourcePickerProps) {
  const datasources = useDatasourceList();
  const active = useActiveDatasource();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-background text-sm text-foreground hover:bg-muted transition-colors"
      >
        <span
          className={`size-1.5 rounded-full ${active ? 'bg-accent' : 'bg-subtle-foreground'}`}
          aria-hidden
        />
        <span className="truncate max-w-[200px]">
          {active?.name ?? 'no datasource'}
        </span>
        <Chevron />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 rounded-md border border-border bg-card shadow-xl z-50 overflow-hidden"
        >
          {datasources.length > 0 && (
            <div className="py-1" role="group" aria-label="Datasources">
              {datasources.map((ds) => (
                <button
                  key={ds.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={ds.id === active?.id}
                  onClick={() => {
                    setActiveDatasource(ds.id);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted"
                >
                  <span
                    className={`size-1.5 rounded-full ${ds.id === active?.id ? 'bg-accent' : 'bg-subtle-foreground'}`}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-foreground">{ds.name}</span>
                  <span className="text-xs text-subtle-foreground truncate max-w-[120px]">
                    {hostOf(ds.url)}
                  </span>
                </button>
              ))}
              <div className="my-1 h-px bg-border" />
            </div>
          )}
          <div className="py-1">
            <MenuAction
              onClick={() => {
                setOpen(false);
                onAdd();
              }}
            >
              <PlusIcon /> Add datasource
            </MenuAction>
            {active && (
              <>
                <MenuAction
                  onClick={() => {
                    setOpen(false);
                    onEdit(active);
                  }}
                >
                  <PencilIcon /> Edit “{active.name}”
                </MenuAction>
                <MenuAction
                  onClick={() => {
                    if (confirm(`Remove datasource "${active.name}"?`)) {
                      removeDatasource(active.id);
                      setOpen(false);
                    }
                  }}
                  tone="danger"
                >
                  <TrashIcon /> Remove “{active.name}”
                </MenuAction>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuAction(props: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'danger';
}) {
  const toneCls =
    props.tone === 'danger'
      ? 'text-[var(--color-level-error)] hover:bg-[var(--color-level-error)]/10'
      : 'text-foreground hover:bg-muted';
  return (
    <button
      type="button"
      role="menuitem"
      onClick={props.onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left ${toneCls}`}
    >
      {props.children}
    </button>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Chevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
