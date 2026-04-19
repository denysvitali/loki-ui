import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import {
  clearHistory,
  readHistory,
  subscribeHistory,
  type HistoryEntry,
} from '@/lib/state/history';

interface HistoryPopoverProps {
  dsId: string;
  onPick: (entry: HistoryEntry, andRun: boolean) => void;
  onClose: () => void;
}

export function HistoryPopover({ dsId, onPick, onClose }: HistoryPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const entries = useSyncExternalStore(
    subscribeHistory,
    () => readHistory(dsId),
    () => [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    // Defer so the opening click doesn't immediately close us.
    const t = setTimeout(
      () => document.addEventListener('mousedown', onDoc),
      0,
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Query history"
      className="absolute right-2 top-[calc(100%+4px)] w-[36rem] max-w-[calc(100vw-2rem)] max-h-[70vh] rounded-md border border-border bg-card shadow-2xl z-50 flex flex-col"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="text-xs text-subtle-foreground uppercase tracking-wider">
          Query history
        </div>
        <button
          type="button"
          onClick={() => clearHistory(dsId)}
          className="text-xs text-subtle-foreground hover:text-[var(--color-level-error)]"
          title="Clear all history for this datasource"
        >
          clear
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="p-6 text-center text-sm text-subtle-foreground">
          No queries yet. Run one.
        </div>
      ) : (
        <ul className="overflow-auto">
          {entries.map((e, i) => (
            <li
              key={`${e.at}-${i}`}
              className="border-b border-border/40 last:border-0"
            >
              <button
                type="button"
                onClick={(ev) => onPick(e, !ev.shiftKey)}
                title="Click to run · Shift+Click to copy into editor without running"
                className="w-full text-left px-3 py-2 hover:bg-muted"
              >
                <div className="font-mono text-xs text-foreground truncate">
                  {e.query}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-subtle-foreground mt-0.5">
                  <span>{formatAgo(Date.now() - e.at)}</span>
                  <span>·</span>
                  <span className="font-mono">
                    {e.from} → {e.to}
                  </span>
                  {e.execMs != null && (
                    <>
                      <span>·</span>
                      <span>{Math.round(e.execMs)} ms</span>
                    </>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="px-3 py-1.5 border-t border-border text-[11px] text-subtle-foreground">
        Enter run · Shift+Enter copy only · Esc close
      </div>
    </div>
  );
}

function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
