import { useEffect, useRef } from 'react';
import { DatasourceForm } from './DatasourceForm';
import type { StoredDatasource } from '@/lib/state/datasources';

interface DatasourceModalProps {
  existing?: StoredDatasource;
  onClose: () => void;
  onSaved: (id: string) => void;
}

/**
 * Minimal accessible modal — focus-trap-lite, Escape closes, click-outside
 * closes. We'll swap this for shadcn's Dialog in a later pass when we pull
 * in the component library.
 */
export function DatasourceModal({ existing, onClose, onSaved }: DatasourceModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Initial focus
    panelRef.current?.querySelector<HTMLInputElement>('input#ds-name')?.focus();
    // Lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ds-modal-title"
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm grid place-items-start md:place-items-center overflow-y-auto"
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-xl m-4 rounded-lg border border-border bg-card shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="ds-modal-title"
            className="text-lg font-semibold text-foreground"
          >
            {existing ? `Edit “${existing.name}”` : 'Add datasource'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            ×
          </button>
        </div>
        <DatasourceForm
          {...(existing ? { existing } : {})}
          onSaved={onSaved}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
