import { useUpdateAvailable } from '@/lib/update/useUpdateCheck';

export function UpdateToast() {
  const { available, dismiss, reload } = useUpdateAvailable();
  if (!available) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-border bg-card shadow-lg p-3 flex items-start gap-3 text-sm"
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground">
          A new version of loki-ui is available
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Reload to update. Your in-memory credentials will be re-requested.
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={dismiss}
          className="h-7 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          Later
        </button>
        <button
          type="button"
          onClick={reload}
          className="h-7 px-3 rounded text-xs font-medium bg-accent text-accent-foreground hover:opacity-90"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
